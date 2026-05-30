import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const tickets = sqliteTable('tickets', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  title:       text('title').notNull(),
  description: text('description').notNull(),
  status:      text('status', { enum: ['open', 'in_progress', 'pending', 'closed'] })
                 .notNull()
                 .default('open'),
  priority:    text('priority', { enum: ['low', 'medium', 'high', 'urgent'] })
                 .notNull()
                 .default('medium'),
  createdBy:   text('created_by').notNull(),
  assignedTo:  text('assigned_to'),
  project:     text('project'),
  createdAt:   integer('created_at').notNull().default(sql`(unixepoch())`),
  updatedAt:   integer('updated_at').notNull().default(sql`(unixepoch())`),
  closedAt:    integer('closed_at'),
});

export const conversationHistory = sqliteTable('conversation_history', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  phoneNumber: text('phone_number').notNull(),
  role:        text('role', { enum: ['user', 'assistant'] }).notNull(),
  content:     text('content').notNull(), // JSON stringified Claude message content
  createdAt:   integer('created_at').notNull().default(sql`(unixepoch())`),
});

export const reportLog = sqliteTable('report_log', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  sentAt:      integer('sent_at').notNull().default(sql`(unixepoch())`),
  recipient:   text('recipient').notNull(),
  ticketCount: integer('ticket_count').notNull(),
  status:      text('status', { enum: ['success', 'failed'] }).notNull(),
});

export const reminders = sqliteTable('reminders', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  userId:    text('user_id').notNull(),
  username:  text('username').notNull(),
  message:   text('message').notNull(),
  remindAt:  integer('remind_at').notNull(),
  sent:      integer('sent').notNull().default(0),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
});

export const userMemories = sqliteTable('user_memories', {
  userId:    text('user_id').primaryKey(),
  username:  text('username'),
  memory:    text('memory').notNull().default(''),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
});

export const salesTargets = sqliteTable('sales_targets', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  weekStart:     integer('week_start').notNull(),
  weekEnd:       integer('week_end').notNull(),
  targetAmount:  real('target_amount').notNull(),
  currentAmount: real('current_amount').notNull().default(0),
  currency:      text('currency').notNull().default('BHD'),
  notes:         text('notes'),
  createdAt:     integer('created_at').notNull().default(sql`(unixepoch())`),
});

export const decisions = sqliteTable('decisions', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  content:   text('content').notNull(),
  context:   text('context'),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
});

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type ConversationMessage = typeof conversationHistory.$inferSelect;
export type UserMemory = typeof userMemories.$inferSelect;
