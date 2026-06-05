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
  dueDate:     integer('due_date'),   // unix timestamp, optional deadline
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

export const clients = sqliteTable('clients', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  name:         text('name').notNull(),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  notes:        text('notes'),
  owner:        text('owner'),  // canonical team member name
  createdAt:    integer('created_at').notNull().default(sql`(unixepoch())`),
  updatedAt:    integer('updated_at').notNull().default(sql`(unixepoch())`),
});

export const deals = sqliteTable('deals', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  clientId:      integer('client_id'),    // nullable for orphan deals
  title:         text('title').notNull(),
  valueBhd:      real('value_bhd').notNull().default(0),
  stage:         text('stage', {
                   enum: ['lead', 'qualified', 'meeting', 'proposal', 'negotiation', 'won', 'lost'],
                 }).notNull().default('lead'),
  owner:         text('owner'),
  expectedClose: integer('expected_close'),
  lostReason:    text('lost_reason'),
  notes:         text('notes'),
  wonAt:         integer('won_at'),
  lostAt:        integer('lost_at'),
  createdAt:     integer('created_at').notNull().default(sql`(unixepoch())`),
  updatedAt:     integer('updated_at').notNull().default(sql`(unixepoch())`),
});

export const meetings = sqliteTable('meetings', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  clientId:    integer('client_id'),
  dealId:      integer('deal_id'),
  title:       text('title').notNull(),
  scheduledAt: integer('scheduled_at').notNull(),
  owner:       text('owner'),
  status:      text('status', {
                 enum: ['planned', 'held', 'rescheduled', 'cancelled'],
               }).notNull().default('planned'),
  outcome:     text('outcome', {
                 enum: ['pending', 'closed', 'follow_up', 'lost', 'rescheduled'],
               }).notNull().default('pending'),
  followUpAt:  integer('follow_up_at'),
  valueBhd:    real('value_bhd'),
  notes:       text('notes'),
  createdAt:   integer('created_at').notNull().default(sql`(unixepoch())`),
  updatedAt:   integer('updated_at').notNull().default(sql`(unixepoch())`),
});

export const fulfillmentProjects = sqliteTable('fulfillment_projects', {
  id:              integer('id').primaryKey({ autoIncrement: true }),
  dealId:          integer('deal_id'),
  clientId:        integer('client_id'),
  projectName:     text('project_name').notNull(),
  projectType:     text('project_type', { enum: ['custom', 'lamma'] }).notNull().default('custom'),
  planeProjectId:  text('plane_project_id'),
  kickoffAt:       integer('kickoff_at').notNull(),
  targetDelivery:  integer('target_delivery').notNull(),
  currentPhase:    text('current_phase').notNull().default('kickoff'),
  status:          text('status', { enum: ['active', 'at_risk', 'done', 'cancelled'] }).notNull().default('active'),
  lastCheckIn:     integer('last_check_in'),
  owner:           text('owner'),
  notes:           text('notes'),
  createdAt:       integer('created_at').notNull().default(sql`(unixepoch())`),
  completedAt:     integer('completed_at'),
});

export const fulfillmentMilestones = sqliteTable('fulfillment_milestones', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  fulfillmentId:  integer('fulfillment_id').notNull(),
  title:          text('title').notNull(),
  phase:          text('phase').notNull(),
  targetDate:     integer('target_date').notNull(),
  completedAt:    integer('completed_at'),
  status:         text('status', { enum: ['pending', 'in_progress', 'done', 'overdue'] }).notNull().default('pending'),
  planeIssueId:   text('plane_issue_id'),
  notes:          text('notes'),
  createdAt:      integer('created_at').notNull().default(sql`(unixepoch())`),
});

export const roadmapItems = sqliteTable('roadmap_items', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  title:       text('title').notNull(),
  description: text('description'),
  status:      text('status', { enum: ['planned', 'in_progress', 'done'] }).notNull().default('planned'),
  priority:    text('priority', { enum: ['low', 'medium', 'high'] }).notNull().default('medium'),
  category:    text('category'),       // e.g. "Feature", "Bug Fix", "Improvement"
  targetDate:  integer('target_date'),  // optional unix timestamp
  createdBy:   text('created_by').notNull(),
  createdAt:   integer('created_at').notNull().default(sql`(unixepoch())`),
  updatedAt:   integer('updated_at').notNull().default(sql`(unixepoch())`),
});

export const roadmapAttachments = sqliteTable('roadmap_attachments', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  itemId:     integer('item_id').notNull(),
  filename:   text('filename').notNull(),
  originalName: text('original_name').notNull(),
  mimeType:   text('mime_type').notNull(),
  size:       integer('size').notNull(),
  createdAt:  integer('created_at').notNull().default(sql`(unixepoch())`),
});

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type ConversationMessage = typeof conversationHistory.$inferSelect;
export type UserMemory = typeof userMemories.$inferSelect;
