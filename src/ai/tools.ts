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
          },
          required: ['title'],
        },
      },
      {
        name: 'update_ticket',
        description: 'Update an existing ticket — status, priority, assignment, or description.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            ticket_id:   { type: 'NUMBER' as any, description: 'The ID of the ticket to update' },
            status:      { type: 'STRING' as any, description: 'New status: open | in_progress | pending | closed' },
            priority:    { type: 'STRING' as any, description: 'New priority: low | medium | high | urgent' },
            assigned_to: { type: 'STRING' as any, description: 'Name or username to assign to' },
            description: { type: 'STRING' as any, description: 'Updated description' },
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
        description: 'List tickets with optional filters by status, priority, or assignee.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            status:      { type: 'STRING' as any, description: 'Filter by status: open | in_progress | pending | closed' },
            priority:    { type: 'STRING' as any, description: 'Filter by priority: low | medium | high | urgent' },
            assigned_to: { type: 'STRING' as any, description: 'Filter by assignee name' },
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
    ],
  },
];
