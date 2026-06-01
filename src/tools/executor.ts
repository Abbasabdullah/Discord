import * as ticketService from '../tickets/ticket.service';
import * as reminderService from '../tickets/reminder.service';
import * as salesService from '../sales/sales.service';
import * as decisionsService from '../ai/decisions';
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
  target_date?: string;
  // tickets
  due_date?: number;
  overdue?: boolean;
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
