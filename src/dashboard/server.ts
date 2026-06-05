import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { env } from '../config/env';
import { getSqlite } from '../db/index';
import { TEAM_MEMBERS } from '../utils/team';
import { getCurrentTarget, getTargetHistory } from '../sales/sales.service';
import { getDecisions } from '../ai/decisions';
import { listDeals, getPipelineSummary, getSalesStats, STAGE_ORDER, updateDeal, getDeal } from '../sales/deals.service';
import { listMeetings, updateMeetingOutcome } from '../sales/meetings.service';
import { listClients } from '../sales/clients.service';
import { listActiveFulfillments, getFulfillmentDetails, updateFulfillment } from '../fulfillment/fulfillment.service';
import { listMilestonesFor, completeMilestone } from '../fulfillment/milestones.service';

// Uploads directory
const UPLOADS_DIR = path.resolve(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const COOKIE_NAME = 'dash_auth';
const COOKIE_SECRET = 'task-advisor-dash-2024';

export async function startDashboard() {
  const password = env.DASHBOARD_PASSWORD;
  if (!password) {
    console.log('⚠️  No DASHBOARD_PASSWORD set — dashboard disabled');
    return;
  }

  const app = Fastify({ logger: false });

  // Plugins
  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB
  await app.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
  });
  // Serve uploaded files
  await app.register(fastifyStatic, {
    root: UPLOADS_DIR,
    prefix: '/uploads/',
    decorateReply: false,
  });

  // ── Auth middleware for /api routes ─────────────────────────
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/') || req.url === '/api/login') return;
    const token = req.cookies[COOKIE_NAME];
    if (token !== COOKIE_SECRET) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // ── POST /api/login ────────────────────────────────────────
  app.post('/api/login', async (req, reply) => {
    const { password: pw } = req.body as { password?: string };
    if (pw === password) {
      reply.setCookie(COOKIE_NAME, COOKIE_SECRET, {
        path: '/',
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      return { success: true };
    }
    reply.code(401).send({ error: 'Wrong password' });
  });

  // ── POST /api/logout ───────────────────────────────────────
  app.post('/api/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return { success: true };
  });

  // ── GET /api/stats ─────────────────────────────────────────
  app.get('/api/stats', async () => {
    const db = getSqlite();
    const openTickets = db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE status != 'closed'`).get() as any;
    const closedTickets = db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE status = 'closed'`).get() as any;
    const pendingReminders = db.prepare(`SELECT COUNT(*) as c FROM reminders WHERE sent = 0`).get() as any;
    const sentReminders = db.prepare(`SELECT COUNT(*) as c FROM reminders WHERE sent = 1`).get() as any;
    const teamMembers = db.prepare(`SELECT COUNT(DISTINCT created_by) as c FROM tickets`).get() as any;
    const urgentTickets = db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE priority = 'urgent' AND status != 'closed'`).get() as any;
    const overdueTickets = db.prepare(`SELECT COUNT(*) as c FROM tickets WHERE due_date IS NOT NULL AND due_date < ? AND status != 'closed'`).get(Math.floor(Date.now() / 1000)) as any;

    return {
      openTickets: openTickets.c,
      closedTickets: closedTickets.c,
      pendingReminders: pendingReminders.c,
      sentReminders: sentReminders.c,
      teamMembers: teamMembers.c,
      urgentTickets: urgentTickets.c,
      overdueTickets: overdueTickets.c,
    };
  });

  // ── GET /api/tickets ───────────────────────────────────────
  app.get('/api/tickets', async (req) => {
    const db = getSqlite();
    const { status, priority, assignee, overdue } = req.query as { status?: string; priority?: string; assignee?: string; overdue?: string };

    let query = `SELECT * FROM tickets WHERE 1=1`;
    const params: any[] = [];

    if (status && status !== 'all') {
      query += ` AND status = ?`;
      params.push(status);
    }
    if (priority && priority !== 'all') {
      query += ` AND priority = ?`;
      params.push(priority);
    }
    if (assignee && assignee !== 'all') {
      query += ` AND assigned_to = ?`;
      params.push(assignee);
    }
    if (overdue === '1') {
      query += ` AND due_date IS NOT NULL AND due_date < ? AND status != 'closed'`;
      params.push(Math.floor(Date.now() / 1000));
    }

    query += ` ORDER BY CASE WHEN due_date IS NOT NULL AND due_date < ${Math.floor(Date.now() / 1000)} THEN 0 ELSE 1 END, due_date ASC NULLS LAST, created_at DESC LIMIT 100`;
    return db.prepare(query).all(...params);
  });

  // ── GET /api/reminders ─────────────────────────────────────
  app.get('/api/reminders', async () => {
    const db = getSqlite();
    return db.prepare(`SELECT * FROM reminders ORDER BY remind_at DESC LIMIT 100`).all();
  });

  // ── GET /api/activity ──────────────────────────────────────
  app.get('/api/activity', async () => {
    const db = getSqlite();

    // Recent tickets (last 20)
    const recentTickets = db.prepare(`
      SELECT id, title, status, priority, created_by, assigned_to, created_at, updated_at, closed_at
      FROM tickets ORDER BY updated_at DESC LIMIT 20
    `).all() as any[];

    // Recent reminders (last 20)
    const recentReminders = db.prepare(`
      SELECT id, username, message, remind_at, sent, created_at
      FROM reminders ORDER BY created_at DESC LIMIT 20
    `).all() as any[];

    // Recent reports (last 10)
    const recentReports = db.prepare(`
      SELECT id, sent_at, ticket_count, status
      FROM report_log ORDER BY sent_at DESC LIMIT 10
    `).all() as any[];

    // Merge into a single activity feed sorted by time
    const activities: any[] = [];

    for (const t of recentTickets) {
      if (t.closed_at) {
        activities.push({ type: 'ticket_closed', time: t.closed_at, data: t });
      }
      activities.push({
        type: t.updated_at > t.created_at + 1 ? 'ticket_updated' : 'ticket_created',
        time: t.updated_at || t.created_at,
        data: t,
      });
    }

    for (const r of recentReminders) {
      activities.push({
        type: r.sent ? 'reminder_sent' : 'reminder_created',
        time: r.sent ? r.remind_at : r.created_at,
        data: r,
      });
    }

    for (const r of recentReports) {
      activities.push({
        type: 'report_sent',
        time: r.sent_at,
        data: r,
      });
    }

    activities.sort((a, b) => b.time - a.time);
    return activities.slice(0, 50);
  });

  // ── GET /api/team ──────────────────────────────────────────
  app.get('/api/team', async () => {
    const db = getSqlite();

    // Get ticket stats grouped by assigned_to (canonical names)
    const rows = db.prepare(`
      SELECT
        assigned_to as name,
        COUNT(*) as total,
        SUM(CASE WHEN status != 'closed' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
        SUM(CASE WHEN priority = 'urgent' AND status != 'closed' THEN 1 ELSE 0 END) as urgent
      FROM tickets
      WHERE assigned_to IS NOT NULL
      GROUP BY assigned_to
    `).all() as any[];

    const statsMap = new Map(rows.map(r => [r.name, r]));

    // Always return all 4 team members, zero-fill if no tickets yet
    return TEAM_MEMBERS.map(name => ({
      name,
      total:  statsMap.get(name)?.total  ?? 0,
      open:   statsMap.get(name)?.open   ?? 0,
      closed: statsMap.get(name)?.closed ?? 0,
      urgent: statsMap.get(name)?.urgent ?? 0,
    }));
  });

  // ── GET /api/sales ─────────────────────────────────────────
  app.get('/api/sales', async () => {
    const current = getCurrentTarget();
    const history = getTargetHistory(8);
    return { current, history };
  });

  // ── GET /api/decisions ─────────────────────────────────────
  app.get('/api/decisions', async (req) => {
    const { search } = req.query as { search?: string };
    return getDecisions(50, search);
  });

  // ── GET /api/roadmap ────────────────────────────────────────
  app.get('/api/roadmap', async (req) => {
    const db = getSqlite();
    const { status } = req.query as { status?: string };
    let query = `SELECT * FROM roadmap_items WHERE 1=1`;
    const params: string[] = [];
    if (status && status !== 'all') { query += ` AND status = ?`; params.push(status); }
    query += ` ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC`;
    const items = db.prepare(query).all(...params) as any[];

    // Attach attachments to each item
    const attachStmt = db.prepare(`SELECT * FROM roadmap_attachments WHERE item_id = ? ORDER BY created_at ASC`);
    return items.map(item => ({
      ...item,
      attachments: (attachStmt.all(item.id) as any[]).map(a => ({
        id: a.id,
        filename: a.filename,
        original_name: a.original_name,
        mime_type: a.mime_type,
        size: a.size,
        url: `/uploads/${a.filename}`,
      })),
    }));
  });

  // ── POST /api/roadmap ─────────────────────────────────────
  app.post('/api/roadmap', async (req, reply) => {
    const db = getSqlite();
    const parts = req.parts();
    const fields: Record<string, string> = {};
    const files: Array<{ filename: string; originalName: string; mimeType: string; size: number }> = [];

    for await (const part of parts) {
      if (part.type === 'field') {
        fields[part.fieldname] = part.value as string;
      } else if (part.type === 'file') {
        const ext = path.extname(part.filename) || '';
        const safeName = crypto.randomUUID() + ext;
        const dest = path.join(UPLOADS_DIR, safeName);
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk);
        const buf = Buffer.concat(chunks);
        fs.writeFileSync(dest, buf);
        files.push({ filename: safeName, originalName: part.filename, mimeType: part.mimetype, size: buf.length });
      }
    }

    if (!fields.title) { reply.code(400).send({ error: 'title is required' }); return; }

    const result = db.prepare(`
      INSERT INTO roadmap_items (title, description, status, priority, category, target_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *
    `).get(
      fields.title,
      fields.description || null,
      fields.status || 'planned',
      fields.priority || 'medium',
      fields.category || null,
      fields.target_date ? parseInt(fields.target_date) : null,
      fields.created_by || 'dashboard',
    ) as any;

    // Save attachments
    const attachStmt = db.prepare(`INSERT INTO roadmap_attachments (item_id, filename, original_name, mime_type, size) VALUES (?, ?, ?, ?, ?)`);
    for (const f of files) {
      attachStmt.run(result.id, f.filename, f.originalName, f.mimeType, f.size);
    }

    return { success: true, id: result.id };
  });

  // ── PUT /api/roadmap/:id ──────────────────────────────────
  app.put('/api/roadmap/:id', async (req, reply) => {
    const db = getSqlite();
    const { id } = req.params as { id: string };
    const body = req.body as any;
    const updates: string[] = [];
    const params: any[] = [];

    if (body.title !== undefined) { updates.push('title = ?'); params.push(body.title); }
    if (body.description !== undefined) { updates.push('description = ?'); params.push(body.description); }
    if (body.status !== undefined) { updates.push('status = ?'); params.push(body.status); }
    if (body.priority !== undefined) { updates.push('priority = ?'); params.push(body.priority); }
    if (body.category !== undefined) { updates.push('category = ?'); params.push(body.category); }
    if (body.target_date !== undefined) { updates.push('target_date = ?'); params.push(body.target_date); }

    if (updates.length === 0) { reply.code(400).send({ error: 'nothing to update' }); return; }
    updates.push('updated_at = ?'); params.push(Math.floor(Date.now() / 1000));
    params.push(parseInt(id));

    db.prepare(`UPDATE roadmap_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return { success: true };
  });

  // ── DELETE /api/roadmap/:id ───────────────────────────────
  app.delete('/api/roadmap/:id', async (req) => {
    const db = getSqlite();
    const { id } = req.params as { id: string };
    // Delete attachments files
    const attachments = db.prepare(`SELECT filename FROM roadmap_attachments WHERE item_id = ?`).all(parseInt(id)) as any[];
    for (const a of attachments) {
      const fp = path.join(UPLOADS_DIR, a.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    db.prepare(`DELETE FROM roadmap_attachments WHERE item_id = ?`).run(parseInt(id));
    db.prepare(`DELETE FROM roadmap_items WHERE id = ?`).run(parseInt(id));
    return { success: true };
  });

  // ── POST /api/roadmap/:id/attachments ─────────────────────
  app.post('/api/roadmap/:id/attachments', async (req) => {
    const db = getSqlite();
    const { id } = req.params as { id: string };
    const parts = req.parts();
    const saved: any[] = [];

    for await (const part of parts) {
      if (part.type === 'file') {
        const ext = path.extname(part.filename) || '';
        const safeName = crypto.randomUUID() + ext;
        const dest = path.join(UPLOADS_DIR, safeName);
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk);
        const buf = Buffer.concat(chunks);
        fs.writeFileSync(dest, buf);
        db.prepare(`INSERT INTO roadmap_attachments (item_id, filename, original_name, mime_type, size) VALUES (?, ?, ?, ?, ?)`)
          .run(parseInt(id), safeName, part.filename, part.mimetype, buf.length);
        saved.push({ filename: safeName, original_name: part.filename, url: `/uploads/${safeName}` });
      }
    }
    return { success: true, attachments: saved };
  });

  // ── DELETE /api/roadmap/attachment/:id ─────────────────────
  app.delete('/api/roadmap/attachment/:id', async (req) => {
    const db = getSqlite();
    const { id } = req.params as { id: string };
    const att = db.prepare(`SELECT filename FROM roadmap_attachments WHERE id = ?`).get(parseInt(id)) as any;
    if (att) {
      const fp = path.join(UPLOADS_DIR, att.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      db.prepare(`DELETE FROM roadmap_attachments WHERE id = ?`).run(parseInt(id));
    }
    return { success: true };
  });

  // ── Pipeline / Deals ───────────────────────────────────────
  app.get('/api/pipeline', async (req) => {
    const { owner, stage } = req.query as { owner?: string; stage?: string };
    const deals = listDeals({
      owner: owner && owner !== 'all' ? owner : undefined,
      stage: stage as any,
      openOnly: !stage || stage === 'all',
    });
    const summary = getPipelineSummary(owner && owner !== 'all' ? owner : undefined);
    const stats = getSalesStats(90);
    return {
      stages: STAGE_ORDER.filter(s => s !== 'won' && s !== 'lost'),
      summary: {
        open_value:    Math.round(summary.openValue),
        weighted:      Math.round(summary.weightedValue),
        total:         summary.totalDeals,
        win_rate_pct:  Math.round(stats.winRate * 100),
        avg_deal:      Math.round(stats.avgDealValue),
        avg_cycle:     stats.avgCycleDays,
        top_lost:      stats.topLostReason,
      },
      by_stage: summary.byStage,
      deals,
    };
  });

  app.put('/api/deals/:id', async (req) => {
    const id = parseInt((req.params as any).id);
    const body = req.body as any;
    const d = updateDeal(id, {
      stage:      body.stage,
      valueBhd:   body.value_bhd,
      owner:      body.owner,
      lostReason: body.lost_reason,
      notes:      body.notes,
    });
    return { success: !!d, deal: d };
  });

  // ── Meetings ───────────────────────────────────────────────
  app.get('/api/meetings', async (req) => {
    const { outcome, owner } = req.query as { outcome?: string; owner?: string };
    const list = listMeetings({
      outcome: outcome && outcome !== 'all' ? outcome as any : undefined,
      owner:   owner && owner !== 'all' ? owner : undefined,
      sinceDays: 30,
      limit: 100,
    });
    return list;
  });

  app.put('/api/meetings/:id/outcome', async (req) => {
    const id = parseInt((req.params as any).id);
    const body = req.body as any;
    try {
      const r = updateMeetingOutcome(id, {
        outcome:    body.outcome,
        valueBhd:   body.value_bhd,
        followUpAt: body.follow_up_at,
        lostReason: body.lost_reason,
        notes:      body.notes,
      });
      return { success: true, meeting: r.meeting, deal_stage: r.deal?.stage };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ── Clients ────────────────────────────────────────────────
  app.get('/api/clients', async () => listClients());

  // ── Fulfillment ────────────────────────────────────────────
  app.get('/api/fulfillment', async (req) => {
    const { owner } = req.query as { owner?: string };
    const projects = listActiveFulfillments(owner && owner !== 'all' ? owner : undefined);
    // Include milestones for each
    return projects.map(p => {
      const milestones = listMilestonesFor(p.id);
      const done = milestones.filter(m => m.status === 'done').length;
      return {
        ...p,
        kickoff_at: p.kickoffAt,
        target_delivery: p.targetDelivery,
        project_name: p.projectName,
        project_type: p.projectType,
        plane_project_id: p.planeProjectId,
        current_phase: p.currentPhase,
        last_check_in: p.lastCheckIn,
        progress_pct: milestones.length > 0 ? Math.round((done / milestones.length) * 100) : 0,
        milestones_count: milestones.length,
        milestones_done: done,
      };
    });
  });

  app.get('/api/fulfillment/:id', async (req) => {
    const id = parseInt((req.params as any).id);
    const details = getFulfillmentDetails(id);
    if (!details) return { error: 'not_found' };
    return {
      project: details.project,
      milestones: details.milestones,
    };
  });

  app.post('/api/fulfillment/:id/check-in', async (req) => {
    const id = parseInt((req.params as any).id);
    const f = updateFulfillment(id, { lastCheckIn: Math.floor(Date.now() / 1000) });
    return { success: !!f };
  });

  app.put('/api/milestones/:id/complete', async (req) => {
    const id = parseInt((req.params as any).id);
    const m = completeMilestone(id);
    return { success: !!m };
  });

  // ── Start ──────────────────────────────────────────────────
  const port = Number(env.DASHBOARD_PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`\n🌐 Dashboard running at http://0.0.0.0:${port}`);
}
