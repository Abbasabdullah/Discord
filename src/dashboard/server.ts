import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import * as path from 'path';
import { env } from '../config/env';
import { getSqlite } from '../db/index';
import { TEAM_MEMBERS } from '../utils/team';

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
  await app.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
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

    return {
      openTickets: openTickets.c,
      closedTickets: closedTickets.c,
      pendingReminders: pendingReminders.c,
      sentReminders: sentReminders.c,
      teamMembers: teamMembers.c,
      urgentTickets: urgentTickets.c,
    };
  });

  // ── GET /api/tickets ───────────────────────────────────────
  app.get('/api/tickets', async (req) => {
    const db = getSqlite();
    const { status, priority, assignee } = req.query as { status?: string; priority?: string; assignee?: string };

    let query = `SELECT * FROM tickets WHERE 1=1`;
    const params: string[] = [];

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

    query += ` ORDER BY created_at DESC LIMIT 100`;
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

  // ── Start ──────────────────────────────────────────────────
  const port = Number(env.DASHBOARD_PORT ?? 3000);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`\n🌐 Dashboard running at http://0.0.0.0:${port}`);
}
