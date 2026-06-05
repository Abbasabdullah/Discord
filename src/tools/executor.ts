import * as ticketService from '../tickets/ticket.service';
import * as reminderService from '../tickets/reminder.service';
import * as salesService from '../sales/sales.service';
import * as decisionsService from '../ai/decisions';
import * as clientsService from '../sales/clients.service';
import * as dealsService from '../sales/deals.service';
import * as meetingsService from '../sales/meetings.service';
import * as fulfillmentService from '../fulfillment/fulfillment.service';
import * as milestonesService from '../fulfillment/milestones.service';
import * as planeSync from '../plane/sync';
import { normalizeAssignee } from '../utils/team';
import { getSqlite } from '../db/index';
import type { Ticket } from '../db/schema';

interface ToolInput {
  ticket_id?: number;
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  status?: 'open' | 'in_progress' | 'pending' | 'closed';
  project?: string;
  limit?: number;
  resolution_note?: string;
  message?: string;
  remind_at?: number;
  // sales
  target_amount?: number;
  current_amount?: number;
  amount?: number;
  // decisions
  content?: string;
  context?: string;
  search?: string;
  // roadmap
  item_id?: number;
  category?: string;
  target_date?: string | number;
  // tickets
  due_date?: number;
  overdue?: boolean;
  // sales CRM
  name?: string;
  contact_email?: string;
  contact_phone?: string;
  client_name?: string;
  scheduled_at?: number;
  value_bhd?: number;
  meeting_id?: number;
  outcome?: string;
  follow_up_at?: number;
  lost_reason?: string;
  deal_id?: number;
  stage?: string;
  expected_close?: number;
  final_value_bhd?: number;
  project_name?: string;
  project_type?: string;
  target_delivery?: number;
  kickoff_at?: number;
  client?: string;
  owner?: string;
  since_days?: number;
  days_back?: number;
  notes?: string;
  // fulfillment
  fulfillment_id?: number;
  milestone_id?: number;
  phase?: string;
  reason?: string;
}

export function executeTool(toolName: string, input: ToolInput, callerPhone: string): string {
  try {
    switch (toolName) {
      case 'create_ticket': {
        if (!input.title) {
          return JSON.stringify({ error: 'title is required' });
        }
        const ticket = ticketService.createTicket({
          title: input.title,
          description: input.description ?? input.title,
          priority: input.priority,
          assignedTo: normalizeAssignee(input.assigned_to),
          project: input.project,
          dueDate: input.due_date,
          createdBy: callerPhone,
        });
        return JSON.stringify({ ticket_id: ticket.id, message: `Ticket #${ticket.id} created successfully`, ticket });
      }

      case 'get_ticket': {
        if (!input.ticket_id) {
          return JSON.stringify({ error: 'ticket_id is required' });
        }
        const ticket = ticketService.getTicket(input.ticket_id);
        if (!ticket) {
          return JSON.stringify({ error: `Ticket #${input.ticket_id} not found` });
        }
        return JSON.stringify({ ticket, age_days: daysSince(ticket.createdAt) });
      }

      case 'update_ticket': {
        if (!input.ticket_id) {
          return JSON.stringify({ error: 'ticket_id is required' });
        }
        const ticket = ticketService.updateTicket(input.ticket_id, {
          status: input.status,
          priority: input.priority,
          assignedTo: normalizeAssignee(input.assigned_to),
          description: input.description,
          project: input.project,
          dueDate: input.due_date,
        });
        if (!ticket) {
          return JSON.stringify({ error: `Ticket #${input.ticket_id} not found` });
        }
        return JSON.stringify({ success: true, ticket });
      }

      case 'list_tickets': {
        const tickets = ticketService.listTickets({
          status: input.status,
          priority: input.priority,
          assignedTo: normalizeAssignee(input.assigned_to),
          project: input.project,
          overdue: input.overdue,
          limit: input.limit ?? 50,
        });
        return JSON.stringify({ count: tickets.length, tickets: tickets.map(summarize) });
      }

      case 'close_ticket': {
        if (!input.ticket_id) {
          return JSON.stringify({ error: 'ticket_id is required' });
        }
        const ticket = ticketService.closeTicket(input.ticket_id);
        if (!ticket) {
          return JSON.stringify({ error: `Ticket #${input.ticket_id} not found` });
        }
        return JSON.stringify({ success: true, ticket_id: ticket.id, closed_at: ticket.closedAt, resolution_note: input.resolution_note });
      }

      case 'set_reminder': {
        if (!input.message || !input.remind_at) {
          return JSON.stringify({ error: 'message and remind_at are required' });
        }
        const reminder = reminderService.createReminder({
          userId:   callerPhone,
          username: callerPhone,
          message:  input.message,
          remindAt: input.remind_at,
        });
        const when = new Date(input.remind_at * 1000).toLocaleString('en-US', { timeZone: 'Asia/Bahrain', dateStyle: 'full', timeStyle: 'short' });
        return JSON.stringify({ success: true, reminder_id: reminder.id, remind_at: when });
      }

      case 'list_reminders': {
        const pending = reminderService.listReminders(callerPhone);
        return JSON.stringify({
          count: pending.length,
          reminders: pending.map(r => ({
            id: r.id,
            message: r.message,
            remind_at: new Date(r.remindAt * 1000).toLocaleString('en-US', { timeZone: 'Asia/Bahrain', dateStyle: 'full', timeStyle: 'short' }),
          })),
        });
      }

      case 'set_sales_target': {
        if (input.target_amount === undefined) return JSON.stringify({ error: 'target_amount is required' });
        const target = salesService.setWeeklyTarget(input.target_amount, input.context);
        const weekStr = new Date(target.weekStart * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' });
        const weekEnd = new Date(target.weekEnd * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' });
        return JSON.stringify({ success: true, target: target.targetAmount, currency: target.currency, week: `${weekStr} – ${weekEnd}` });
      }

      case 'update_sales_pipeline': {
        if (input.current_amount === undefined) return JSON.stringify({ error: 'current_amount is required' });
        const target = salesService.updatePipeline(input.current_amount);
        if (!target) return JSON.stringify({ error: 'No sales target set for this week. Set one first with set_sales_target.' });
        const gap = target.targetAmount - target.currentAmount;
        const pct = Math.round((target.currentAmount / target.targetAmount) * 100);
        return JSON.stringify({ success: true, target: target.targetAmount, current: target.currentAmount, gap, percentage: pct, currency: target.currency });
      }

      case 'add_to_pipeline': {
        if (input.amount === undefined) return JSON.stringify({ error: 'amount is required' });
        const target = salesService.addToPipeline(input.amount);
        if (!target) return JSON.stringify({ error: 'No sales target set for this week.' });
        const gap = target.targetAmount - target.currentAmount;
        const pct = Math.round((target.currentAmount / target.targetAmount) * 100);
        return JSON.stringify({ success: true, added: input.amount, total: target.currentAmount, target: target.targetAmount, gap, percentage: pct, currency: target.currency });
      }

      case 'get_sales_status': {
        const target = salesService.getCurrentTarget();
        if (!target) return JSON.stringify({ status: 'no_target', message: 'No sales target set for this week. Ask the team to set one.' });
        const gap = target.targetAmount - target.currentAmount;
        const pct = Math.round((target.currentAmount / target.targetAmount) * 100);
        const weekEnd = new Date(target.weekEnd * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', weekday: 'long', month: 'short', day: 'numeric' });
        const history = salesService.getTargetHistory(4).slice(1).map(h => ({
          week: new Date(h.weekStart * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' }),
          target: h.targetAmount, achieved: h.currentAmount,
          result: Math.round((h.currentAmount / h.targetAmount) * 100) + '%',
        }));
        return JSON.stringify({ target: target.targetAmount, current: target.currentAmount, gap, percentage: pct, currency: target.currency, week_ends: weekEnd, past_weeks: history });
      }

      case 'log_decision': {
        if (!input.content) return JSON.stringify({ error: 'content is required' });
        const decision = decisionsService.logDecision(input.content, callerPhone, input.context);
        return JSON.stringify({ success: true, decision_id: decision.id, saved: decision.content });
      }

      case 'get_decisions': {
        const decisions = decisionsService.getDecisions(input.limit ?? 10, input.search);
        return JSON.stringify({
          count: decisions.length,
          decisions: decisions.map(d => ({
            id: d.id,
            content: d.content,
            context: d.context,
            date: new Date(d.createdAt * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric', year: 'numeric' }),
          })),
        });
      }

      case 'add_roadmap_item': {
        if (!input.title) return JSON.stringify({ error: 'title is required' });
        const db = getSqlite();
        let targetTs: number | null = null;
        if (input.target_date) {
          const d = new Date(input.target_date);
          if (!isNaN(d.getTime())) targetTs = Math.floor(d.getTime() / 1000);
        }
        const result = db.prepare(`
          INSERT INTO roadmap_items (title, description, status, priority, category, target_date, created_by)
          VALUES (?, ?, 'planned', ?, ?, ?, ?) RETURNING *
        `).get(
          input.title,
          input.description ?? null,
          input.priority ?? 'medium',
          input.category ?? null,
          targetTs,
          callerPhone,
        ) as any;
        const targetStr = targetTs ? new Date(targetTs * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        return JSON.stringify({ success: true, id: result.id, title: result.title, priority: result.priority, category: result.category, target: targetStr });
      }

      case 'list_roadmap': {
        const db = getSqlite();
        let query = `SELECT id, title, status, priority, category, target_date FROM roadmap_items WHERE 1=1`;
        const params: string[] = [];
        if (input.status) { query += ` AND status = ?`; params.push(input.status); }
        query += ` ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC`;
        const items = db.prepare(query).all(...params) as any[];
        return JSON.stringify({
          count: items.length,
          items: items.map(i => ({
            id: i.id,
            title: i.title,
            status: i.status,
            priority: i.priority,
            category: i.category,
            target: i.target_date ? new Date(i.target_date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null,
          })),
        });
      }

      case 'update_roadmap_item': {
        if (!input.item_id) return JSON.stringify({ error: 'item_id is required' });
        const db = getSqlite();
        const updates: string[] = [];
        const params: any[] = [];
        if (input.status) { updates.push('status = ?'); params.push(input.status); }
        if (input.priority) { updates.push('priority = ?'); params.push(input.priority); }
        if (input.category) { updates.push('category = ?'); params.push(input.category); }
        if (input.description) { updates.push('description = ?'); params.push(input.description); }
        if (updates.length === 0) return JSON.stringify({ error: 'nothing to update' });
        updates.push('updated_at = ?'); params.push(Math.floor(Date.now() / 1000));
        params.push(input.item_id);
        const changed = db.prepare(`UPDATE roadmap_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        if (changed.changes === 0) return JSON.stringify({ error: `Roadmap item #${input.item_id} not found` });
        return JSON.stringify({ success: true, item_id: input.item_id });
      }

      case 'delete_roadmap_item': {
        if (!input.item_id) return JSON.stringify({ error: 'item_id is required' });
        const db = getSqlite();
        db.prepare(`DELETE FROM roadmap_attachments WHERE item_id = ?`).run(input.item_id);
        const result = db.prepare(`DELETE FROM roadmap_items WHERE id = ?`).run(input.item_id);
        if (result.changes === 0) return JSON.stringify({ error: `Roadmap item #${input.item_id} not found` });
        return JSON.stringify({ success: true, deleted: input.item_id });
      }

      case 'get_workload': {
        const db = getSqlite();
        const rows = db.prepare(`
          SELECT assigned_to as name, COUNT(*) as open_tasks
          FROM tickets WHERE status != 'closed' AND assigned_to IS NOT NULL
          GROUP BY assigned_to
        `).all() as any[];
        const members = ['Hasan', 'Hussain', 'Abbas', 'Anas'];
        const map = new Map(rows.map((r: any) => [r.name, r.open_tasks]));
        const workload = members.map(name => ({ name, open_tasks: map.get(name) ?? 0 }))
          .sort((a, b) => a.open_tasks - b.open_tasks);
        return JSON.stringify({ workload, suggestion: `${workload[0].name} has the lightest load (${workload[0].open_tasks} open tasks)` });
      }

      // ── Sales CRM ────────────────────────────────────
      case 'create_client': {
        if (!input.name) return JSON.stringify({ error: 'name is required' });
        const c = clientsService.createClient({
          name: input.name,
          contactEmail: input.contact_email,
          contactPhone: input.contact_phone,
          notes: input.notes,
          owner: normalizeAssignee(input.owner),
        });
        return JSON.stringify({ success: true, client_id: c.id, name: c.name });
      }

      case 'list_clients': {
        const clients = clientsService.listClients(normalizeAssignee(input.owner));
        return JSON.stringify({
          count: clients.length,
          clients: clients.map(c => ({
            id: c.id, name: c.name, owner: c.owner,
            email: c.contactEmail, phone: c.contactPhone,
          })),
        });
      }

      case 'log_meeting': {
        if (!input.client_name) return JSON.stringify({ error: 'client_name is required' });
        const result = meetingsService.logMeeting({
          clientName: input.client_name,
          title:      input.title,
          scheduledAt: input.scheduled_at,
          owner:      normalizeAssignee(input.owner),
          notes:      input.notes,
          valueBhd:   input.value_bhd,
        });
        return JSON.stringify({
          success: true,
          meeting_id: result.meeting.id,
          client_name: result.meeting.clientName,
          client_created: result.clientCreated,
          deal_id: result.deal?.id ?? null,
          deal_stage: result.deal?.stage ?? null,
          scheduled_at: new Date(result.meeting.scheduledAt * 1000).toLocaleString('en-US', { timeZone: 'Asia/Bahrain', dateStyle: 'medium', timeStyle: 'short' }),
        });
      }

      case 'update_meeting_outcome': {
        if (!input.meeting_id || !input.outcome) return JSON.stringify({ error: 'meeting_id and outcome are required' });
        try {
          const result = meetingsService.updateMeetingOutcome(input.meeting_id, {
            outcome:    input.outcome as any,
            valueBhd:   input.value_bhd,
            followUpAt: input.follow_up_at,
            lostReason: input.lost_reason,
            notes:      input.notes,
          });
          return JSON.stringify({
            success: true,
            meeting_id: result.meeting.id,
            outcome: result.meeting.outcome,
            deal_stage: result.deal?.stage ?? null,
            deal_id: result.deal?.id ?? null,
          });
        } catch (err: any) {
          return JSON.stringify({ error: err.message ?? String(err) });
        }
      }

      case 'list_meetings': {
        const meetings = meetingsService.listMeetings({
          owner:     normalizeAssignee(input.owner),
          outcome:   input.outcome as any,
          sinceDays: input.since_days,
          limit:     30,
        });
        return JSON.stringify({
          count: meetings.length,
          meetings: meetings.map(m => ({
            id: m.id,
            client: m.clientName,
            owner: m.owner,
            title: m.title,
            scheduled: new Date(m.scheduledAt * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' }),
            outcome: m.outcome,
            follow_up: m.followUpAt ? new Date(m.followUpAt * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' }) : null,
          })),
        });
      }

      case 'create_deal': {
        if (!input.title) return JSON.stringify({ error: 'title is required' });
        const d = dealsService.createDeal({
          clientName: input.client_name,
          title:      input.title,
          valueBhd:   input.value_bhd,
          stage:      input.stage as any,
          owner:      normalizeAssignee(input.owner),
          expectedClose: input.expected_close,
        });
        return JSON.stringify({
          success: true, deal_id: d.id, title: d.title, stage: d.stage,
          value: d.valueBhd, client: d.clientName, owner: d.owner,
        });
      }

      case 'move_deal': {
        if (!input.deal_id || !input.stage) return JSON.stringify({ error: 'deal_id and stage required' });
        const d = dealsService.updateDeal(input.deal_id, {
          stage: input.stage as any,
          notes: input.notes,
        });
        if (!d) return JSON.stringify({ error: `Deal #${input.deal_id} not found` });
        return JSON.stringify({ success: true, deal_id: d.id, stage: d.stage });
      }

      case 'mark_deal_won': {
        if (!input.deal_id) return JSON.stringify({ error: 'deal_id is required' });
        const deal = dealsService.updateDeal(input.deal_id, {
          stage: 'won',
          valueBhd: input.final_value_bhd,
        });
        if (!deal) return JSON.stringify({ error: `Deal #${input.deal_id} not found` });
        // Infer project_type if not provided
        let projectType = input.project_type as 'custom' | 'lamma' | undefined;
        if (!projectType) {
          if (!deal.clientName || deal.clientName.toLowerCase() === 'lamma') projectType = 'lamma';
          else projectType = 'custom';
        }
        const defaultDays = projectType === 'lamma' ? 3 : 30;
        const kickoff = input.kickoff_at ?? Math.floor(Date.now() / 1000);
        const target = input.target_delivery ?? (kickoff + defaultDays * 86400);
        return JSON.stringify({
          success: true,
          deal_id: deal.id,
          value: deal.valueBhd,
          client: deal.clientName,
          inferred_project_type: projectType,
          inferred_project_name: input.project_name ?? `${deal.clientName ?? 'Internal'} — ${deal.title}`,
          kickoff_at: new Date(kickoff * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' }),
          target_delivery: new Date(target * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' }),
          default_days: defaultDays,
          next_step: `Confirm with the user, then call start_fulfillment with deal_id=${deal.id}, project_type=${projectType}, target_delivery=${target}`,
        });
      }

      case 'mark_deal_lost': {
        if (!input.deal_id || !input.lost_reason) return JSON.stringify({ error: 'deal_id and lost_reason required' });
        const d = dealsService.updateDeal(input.deal_id, {
          stage: 'lost',
          lostReason: input.lost_reason,
        });
        if (!d) return JSON.stringify({ error: `Deal #${input.deal_id} not found` });
        return JSON.stringify({ success: true, deal_id: d.id, lost_reason: d.lostReason });
      }

      case 'list_pipeline': {
        let clientId: number | undefined;
        if (input.client) {
          const c = clientsService.findClientByName(input.client);
          if (c) clientId = c.id;
        }
        const deals = dealsService.listDeals({
          owner: normalizeAssignee(input.owner),
          stage: input.stage as any,
          clientId,
          openOnly: !input.stage,
        });
        const summary = dealsService.getPipelineSummary(normalizeAssignee(input.owner));
        return JSON.stringify({
          open_value: Math.round(summary.openValue),
          weighted_value: Math.round(summary.weightedValue),
          total_open: summary.totalDeals,
          by_stage: Object.fromEntries(
            Object.entries(summary.byStage).map(([k, v]: [string, any]) => [
              k,
              { count: v.count, value: Math.round(v.value) },
            ])
          ),
          deals: deals.slice(0, 30).map(d => ({
            id: d.id, title: d.title, client: d.clientName, value: d.valueBhd,
            stage: d.stage, owner: d.owner,
            expected_close: d.expectedClose ? new Date(d.expectedClose * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' }) : null,
          })),
        });
      }

      case 'pipeline_value': {
        const s = dealsService.getPipelineSummary(normalizeAssignee(input.owner));
        return JSON.stringify({
          open_value: Math.round(s.openValue),
          weighted_value: Math.round(s.weightedValue),
          total_deals: s.totalDeals,
          currency: 'BHD',
        });
      }

      case 'sales_stats': {
        const stats = dealsService.getSalesStats(input.days_back ?? 90);
        return JSON.stringify({
          window_days:    input.days_back ?? 90,
          win_rate_pct:   Math.round(stats.winRate * 100),
          won:            stats.wonCount,
          lost:           stats.lostCount,
          avg_deal_bhd:   stats.avgDealValue,
          total_won_bhd:  stats.totalWonValue,
          avg_cycle_days: stats.avgCycleDays,
          top_lost_reason: stats.topLostReason,
        });
      }

      // ── Fulfillment ──────────────────────────────────
      case 'start_fulfillment': {
        if (!input.deal_id) return JSON.stringify({ error: 'deal_id is required' });
        try {
          const { project, milestones } = fulfillmentService.fulfillmentForWonDeal(input.deal_id, {
            projectName: input.project_name,
            projectType: input.project_type as any,
            kickoffAt:   input.kickoff_at,
            targetDelivery: input.target_delivery,
          });
          // Fire-and-forget Plane sync (non-blocking)
          planeSync.syncNewFulfillment(project, milestones).catch(err =>
            console.error('Plane sync (background) error:', err?.message ?? err)
          );
          return JSON.stringify({
            success: true,
            fulfillment_id: project.id,
            project_name: project.projectName,
            project_type: project.projectType,
            kickoff: new Date(project.kickoffAt * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' }),
            target_delivery: new Date(project.targetDelivery * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' }),
            owner: project.owner,
            milestones_count: milestones.length,
            milestones: milestones.map(m => ({
              id: m.id, title: m.title, phase: m.phase,
              target: new Date(m.targetDate * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' }),
            })),
            plane_dashboard: `http://194.163.157.202:8888/lamma/projects/`,
          });
        } catch (err: any) {
          return JSON.stringify({ error: err.message ?? String(err) });
        }
      }

      case 'complete_milestone': {
        if (!input.milestone_id) return JSON.stringify({ error: 'milestone_id required' });
        const m = milestonesService.completeMilestone(input.milestone_id, input.notes);
        if (!m) return JSON.stringify({ error: `Milestone #${input.milestone_id} not found` });
        // Close in Plane (non-blocking)
        planeSync.closeMilestoneIssue(m).catch(err =>
          console.error('Plane closeMilestoneIssue (background) error:', err?.message ?? err)
        );
        return JSON.stringify({ success: true, milestone_id: m.id, status: m.status, completed: true });
      }

      case 'add_milestone': {
        if (!input.fulfillment_id || !input.title || !input.target_date) {
          return JSON.stringify({ error: 'fulfillment_id, title, target_date required' });
        }
        const targetTs2 = typeof input.target_date === 'string'
          ? Math.floor(new Date(input.target_date).getTime() / 1000)
          : (input.target_date as number);
        const m2 = milestonesService.createMilestone({
          fulfillmentId: input.fulfillment_id,
          title:         input.title,
          phase:         input.phase ?? 'implementation',
          targetDate:    targetTs2,
        });
        // Sync to Plane (background)
        planeSync.syncMilestoneToIssue(m2).catch(err =>
          console.error('Plane syncMilestoneToIssue (background) error:', err?.message ?? err)
        );
        return JSON.stringify({
          success: true, milestone_id: m2.id, title: m2.title,
          target: new Date(m2.targetDate * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' }),
        });
      }

      case 'update_fulfillment_phase': {
        if (!input.fulfillment_id || !input.phase) return JSON.stringify({ error: 'fulfillment_id and phase required' });
        const f = fulfillmentService.updateFulfillment(input.fulfillment_id, {
          currentPhase: input.phase as any,
          lastCheckIn: Math.floor(Date.now() / 1000),
        });
        if (!f) return JSON.stringify({ error: `Fulfillment #${input.fulfillment_id} not found` });
        return JSON.stringify({ success: true, fulfillment_id: f.id, current_phase: f.currentPhase });
      }

      case 'mark_fulfillment_at_risk': {
        if (!input.fulfillment_id || !input.reason) return JSON.stringify({ error: 'fulfillment_id and reason required' });
        const f = fulfillmentService.updateFulfillment(input.fulfillment_id, {
          status: 'at_risk',
          notes:  input.reason,
        });
        if (!f) return JSON.stringify({ error: `Fulfillment #${input.fulfillment_id} not found` });
        return JSON.stringify({ success: true, fulfillment_id: f.id, status: f.status });
      }

      case 'complete_fulfillment': {
        if (!input.fulfillment_id) return JSON.stringify({ error: 'fulfillment_id required' });
        const f = fulfillmentService.updateFulfillment(input.fulfillment_id, {
          status: 'done',
          currentPhase: 'done',
          notes: input.notes,
        });
        if (!f) return JSON.stringify({ error: `Fulfillment #${input.fulfillment_id} not found` });
        return JSON.stringify({ success: true, fulfillment_id: f.id, status: 'done' });
      }

      case 'list_active_fulfillments': {
        const list = fulfillmentService.listActiveFulfillments(normalizeAssignee(input.owner));
        return JSON.stringify({
          count: list.length,
          fulfillments: list.map(f => {
            const milestones = milestonesService.listMilestonesFor(f.id);
            const done = milestones.filter(m => m.status === 'done').length;
            return {
              id: f.id,
              project_name: f.projectName,
              project_type: f.projectType,
              phase: f.currentPhase,
              status: f.status,
              owner: f.owner,
              target_delivery: new Date(f.targetDelivery * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' }),
              progress: `${done}/${milestones.length}`,
            };
          }),
        });
      }

      case 'fulfillment_status': {
        if (!input.fulfillment_id) return JSON.stringify({ error: 'fulfillment_id required' });
        const details = fulfillmentService.getFulfillmentDetails(input.fulfillment_id);
        if (!details) return JSON.stringify({ error: `Fulfillment #${input.fulfillment_id} not found` });
        const { project, milestones } = details;
        const done = milestones.filter(m => m.status === 'done').length;
        const now = Math.floor(Date.now() / 1000);
        return JSON.stringify({
          id:           project.id,
          project_name: project.projectName,
          project_type: project.projectType,
          owner:        project.owner,
          phase:        project.currentPhase,
          status:       project.status,
          kickoff:      new Date(project.kickoffAt * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' }),
          target_delivery: new Date(project.targetDelivery * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' }),
          days_since_kickoff: Math.floor((now - project.kickoffAt) / 86400),
          days_to_delivery: Math.floor((project.targetDelivery - now) / 86400),
          progress: `${done}/${milestones.length}`,
          milestones: milestones.map(m => ({
            id: m.id,
            title: m.title,
            phase: m.phase,
            target: new Date(m.targetDate * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' }),
            status: m.status,
            overdue: !m.completedAt && m.targetDate < now,
            completed: !!m.completedAt,
          })),
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return JSON.stringify({ error: message });
  }
}

function daysSince(unixTimestamp: number): number {
  return Math.floor((Date.now() / 1000 - unixTimestamp) / 86400);
}

function summarize(ticket: Ticket) {
  const ts = Math.floor(Date.now() / 1000);
  const due = ticket.dueDate
    ? new Date(ticket.dueDate * 1000).toLocaleDateString('en-US', { timeZone: 'Asia/Bahrain', month: 'short', day: 'numeric' })
    : null;
  return {
    id:          ticket.id,
    title:       ticket.title,
    status:      ticket.status,
    priority:    ticket.priority,
    assigned_to: ticket.assignedTo,
    project:     ticket.project ?? null,
    due:         due,
    overdue:     ticket.dueDate ? ticket.dueDate < ts : false,
  };
}
