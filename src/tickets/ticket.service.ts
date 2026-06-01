import { eq } from 'drizzle-orm';
import { db, getSqlite } from '../db/index';
import { tickets } from '../db/schema';
import type { Ticket } from '../db/schema';
import type { CreateTicketInput, UpdateTicketInput, TicketFilters } from './ticket.types';

export function createTicket(input: CreateTicketInput): Ticket {
  const result = db.insert(tickets).values({
    title: input.title,
    description: input.description,
    priority: input.priority ?? 'medium',
    assignedTo: input.assignedTo ?? null,
    project: input.project ?? null,
    dueDate: input.dueDate ?? null,
    createdBy: input.createdBy,
    status: 'open',
  }).returning().get();

  return result;
}

export function getTicket(id: number): Ticket | null {
  return db.select().from(tickets).where(eq(tickets.id, id)).get() ?? null;
}

export function updateTicket(id: number, input: UpdateTicketInput): Ticket | null {
  const updates: Partial<typeof tickets.$inferInsert> = {
    updatedAt: Math.floor(Date.now() / 1000),
  };

  if (input.status !== undefined) updates.status = input.status;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.assignedTo !== undefined) updates.assignedTo = input.assignedTo;
  if (input.description !== undefined) updates.description = input.description;

  if (input.project !== undefined) updates.project = input.project;
  if (input.dueDate !== undefined) updates.dueDate = input.dueDate;

  if (input.status === 'closed') {
    updates.closedAt = Math.floor(Date.now() / 1000);
  }

  const result = db.update(tickets)
    .set(updates)
    .where(eq(tickets.id, id))
    .returning()
    .get();

  return result ?? null;
}

export function listTickets(filters: TicketFilters = {}): Ticket[] {
  // Build query with optional filters using raw SQL for simplicity
  let query = `SELECT * FROM tickets WHERE 1=1`;
  const params: (string | number)[] = [];

  if (filters.status) {
    query += ` AND status = ?`;
    params.push(filters.status);
  }
  if (filters.priority) {
    query += ` AND priority = ?`;
    params.push(filters.priority);
  }
  if (filters.assignedTo) {
    query += ` AND LOWER(assigned_to) = LOWER(?)`;
    params.push(filters.assignedTo);
  }
  if (filters.project) {
    query += ` AND LOWER(project) = LOWER(?)`;
    params.push(filters.project);
  }
  if (filters.overdue) {
    query += ` AND due_date IS NOT NULL AND due_date < ? AND status != 'closed'`;
    params.push(Math.floor(Date.now() / 1000));
  }

  query += ` ORDER BY CASE WHEN due_date IS NOT NULL THEN due_date ELSE 9999999999 END ASC, created_at DESC`;

  if (filters.limit) {
    query += ` LIMIT ?`;
    params.push(filters.limit);
  }

  const stmt = getSqlite().prepare(query);
  const rows = stmt.all(...params) as any[];

  // Map snake_case DB columns to camelCase
  return rows.map(mapRow);
}

export function closeTicket(id: number): Ticket | null {
  return updateTicket(id, { status: 'closed' });
}

export function getOpenTicketsForReport(): Ticket[] {
  return listTickets({ limit: 100 });
}

// Helper: map DB row (snake_case) to Ticket (camelCase)
function mapRow(row: any): Ticket {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    createdBy: row.created_by,
    assignedTo: row.assigned_to ?? null,
    project: row.project ?? null,
    dueDate: row.due_date ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at ?? null,
  };
}
