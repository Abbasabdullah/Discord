import type { Tool } from '@google/generative-ai';

export const TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'create_ticket',
        description: 'Create a new support ticket. Use when the user reports an issue or makes a request.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            title:       { type: 'STRING' as any, description: 'Short clear title (max 100 chars)' },
            description: { type: 'STRING' as any, description: 'Full description of the issue (optional — defaults to title if not provided)' },
            priority:    { type: 'STRING' as any, description: 'Priority: low | medium | high | urgent (default: medium)' },
            assigned_to: { type: 'STRING' as any, description: 'Name or username to assign the ticket to (optional)' },
            project:     { type: 'STRING' as any, description: 'Project name this ticket belongs to (e.g. Magna, Constractions, Wline, Group Plus)' },
            due_date:    { type: 'NUMBER' as any, description: 'Deadline as unix timestamp (seconds). Calculate from today\'s date. Use when user mentions "by Friday", "due tomorrow", "deadline June 15", etc.' },
          },
          required: ['title'],
        },
      },
      {
        name: 'update_ticket',
        description: 'Update an existing ticket — status, priority, assignment, description, or project.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            ticket_id:   { type: 'NUMBER' as any, description: 'The ID of the ticket to update' },
            status:      { type: 'STRING' as any, description: 'New status: open | in_progress | pending | closed' },
            priority:    { type: 'STRING' as any, description: 'New priority: low | medium | high | urgent' },
            assigned_to: { type: 'STRING' as any, description: 'Name or username to assign to' },
            description: { type: 'STRING' as any, description: 'Updated description' },
            project:     { type: 'STRING' as any, description: 'Project name to tag this ticket with' },
            due_date:    { type: 'NUMBER' as any, description: 'New deadline as unix timestamp (seconds)' },
          },
          required: ['ticket_id'],
        },
      },
      {
        name: 'get_ticket',
        description: 'Get full details of a specific ticket by its ID.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            ticket_id: { type: 'NUMBER' as any, description: 'The ID of the ticket' },
          },
          required: ['ticket_id'],
        },
      },
      {
        name: 'list_tickets',
        description: 'List tickets with optional filters by status, priority, assignee, or project.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            status:      { type: 'STRING' as any, description: 'Filter by status: open | in_progress | pending | closed' },
            priority:    { type: 'STRING' as any, description: 'Filter by priority: low | medium | high | urgent' },
            assigned_to: { type: 'STRING' as any, description: 'Filter by assignee name' },
            project:     { type: 'STRING' as any, description: 'Filter by project name' },
            overdue:     { type: 'BOOLEAN' as any, description: 'If true, only return tickets past their deadline' },
            limit:       { type: 'NUMBER' as any, description: 'Max results to return (default 20)' },
          },
          required: [],
        },
      },
      {
        name: 'close_ticket',
        description: 'Mark a ticket as closed/resolved.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            ticket_id:       { type: 'NUMBER' as any, description: 'The ID of the ticket to close' },
            resolution_note: { type: 'STRING' as any, description: 'Optional note about the resolution' },
          },
          required: ['ticket_id'],
        },
      },
      {
        name: 'set_reminder',
        description: 'Set a reminder for the user at a specific date and time. Use when user says "remind me", "notify me", "don\'t let me forget", etc.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            message:    { type: 'STRING' as any, description: 'What to remind the user about' },
            remind_at:  { type: 'NUMBER' as any, description: 'Unix timestamp (seconds) when to send the reminder. Calculate from today\'s date using the current date provided in the system prompt.' },
          },
          required: ['message', 'remind_at'],
        },
      },
      {
        name: 'list_reminders',
        description: 'List all pending (unsent) reminders for the current user.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {},
          required: [],
        },
      },
      {
        name: 'add_roadmap_item',
        description: 'Add an item to the product development roadmap. Use when the team discusses a new feature, improvement, or bug fix to build.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            title:       { type: 'STRING' as any, description: 'Short title of the feature or item' },
            description: { type: 'STRING' as any, description: 'Detailed description (optional)' },
            priority:    { type: 'STRING' as any, description: 'Priority: low | medium | high (default: medium)' },
            category:    { type: 'STRING' as any, description: 'Category: Feature | Bug Fix | Improvement | Design | Infrastructure' },
            target_date: { type: 'STRING' as any, description: 'Target date as YYYY-MM-DD (optional)' },
          },
          required: ['title'],
        },
      },
      {
        name: 'list_roadmap',
        description: 'List all items on the product roadmap. Optionally filter by status.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            status: { type: 'STRING' as any, description: 'Filter by status: planned | in_progress | done (optional — shows all if omitted)' },
          },
          required: [],
        },
      },
      {
        name: 'update_roadmap_item',
        description: 'Update a roadmap item — change its status, priority, category, or description.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            item_id:     { type: 'NUMBER' as any, description: 'The ID of the roadmap item to update' },
            status:      { type: 'STRING' as any, description: 'New status: planned | in_progress | done' },
            priority:    { type: 'STRING' as any, description: 'New priority: low | medium | high' },
            category:    { type: 'STRING' as any, description: 'New category' },
            description: { type: 'STRING' as any, description: 'Updated description' },
          },
          required: ['item_id'],
        },
      },
      {
        name: 'delete_roadmap_item',
        description: 'Delete an item from the roadmap.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            item_id: { type: 'NUMBER' as any, description: 'The ID of the roadmap item to delete' },
          },
          required: ['item_id'],
        },
      },
      {
        name: 'set_sales_target',
        description: 'Set the weekly sales target amount. Call when the team defines their goal for this week.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            target_amount: { type: 'NUMBER' as any, description: 'Sales target amount in BHD (e.g. 5000)' },
            notes:         { type: 'STRING' as any, description: 'Optional notes about this week\'s target or focus' },
          },
          required: ['target_amount'],
        },
      },
      {
        name: 'update_sales_pipeline',
        description: 'Set the current total pipeline amount for this week. Use when the team reports the total pipeline value.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            current_amount: { type: 'NUMBER' as any, description: 'Total current pipeline amount in BHD' },
          },
          required: ['current_amount'],
        },
      },
      {
        name: 'add_to_pipeline',
        description: 'Add an amount to the current week pipeline (e.g. when a new deal or opportunity is added).',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            amount: { type: 'NUMBER' as any, description: 'Amount to add in BHD' },
          },
          required: ['amount'],
        },
      },
      {
        name: 'get_sales_status',
        description: 'Get the current week\'s sales target, pipeline, gap, percentage, and history. ALWAYS call this when asked about sales, targets, or pipeline.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {},
          required: [],
        },
      },
      {
        name: 'log_decision',
        description: 'Log an important team decision so it can be recalled later. Call this proactively whenever the team decides something.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            content: { type: 'STRING' as any, description: 'The decision that was made' },
            context: { type: 'STRING' as any, description: 'Background or reason for the decision (optional)' },
          },
          required: ['content'],
        },
      },
      {
        name: 'get_decisions',
        description: 'Recall past team decisions. Optionally filter by keyword.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            search: { type: 'STRING' as any, description: 'Keyword to search decisions by (optional)' },
            limit:  { type: 'NUMBER' as any, description: 'Max number to return (default 10)' },
          },
          required: [],
        },
      },
      {
        name: 'get_workload',
        description: 'Get the open ticket count per team member to help decide who to assign a new task to.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {},
          required: [],
        },
      },
    ],
  },
];
