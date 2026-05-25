import * as ticketService from '../tickets/ticket.service';
import * as reminderService from '../tickets/reminder.service';
import { normalizeAssignee } from '../utils/team';
import type { Ticket } from '../db/schema';

interface ToolInput {
  ticket_id?: number;
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  status?: 'open' | 'in_progress' | 'pending' | 'closed';
  limit?: number;
  resolution_note?: string;
  message?: string;
  remind_at?: number;
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
          limit: input.limit ?? 20,
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
  return {
    id: ticket.id,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    assigned_to: ticket.assignedTo,
    created_at: ticket.createdAt,
    age_days: daysSince(ticket.createdAt),
  };
}
