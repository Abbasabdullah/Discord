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
      // ── Sales CRM tools ───────────────────────────────
      {
        name: 'create_client',
        description: 'Create a new client (a company or person we sell to). Use when a new client is mentioned.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            name:           { type: 'STRING' as any, description: 'Client / company name' },
            contact_email:  { type: 'STRING' as any, description: 'Primary contact email' },
            contact_phone:  { type: 'STRING' as any, description: 'Primary phone number' },
            notes:          { type: 'STRING' as any, description: 'Any background notes' },
            owner:          { type: 'STRING' as any, description: 'Team member who owns the relationship' },
          },
          required: ['name'],
        },
      },
      {
        name: 'list_clients',
        description: 'List clients, optionally filtered by owner. Returns up to 100 clients.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            owner: { type: 'STRING' as any, description: 'Filter by owner team member' },
          },
          required: [],
        },
      },
      {
        name: 'log_meeting',
        description: 'Log a client meeting that happened (or is scheduled). Auto-creates the client and a meeting-stage deal if needed. Use whenever the user mentions meeting a client.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            client_name:  { type: 'STRING' as any, description: 'The client we met with (auto-creates if not exists)' },
            title:        { type: 'STRING' as any, description: 'Short title of the meeting (e.g. "Discovery call with Magna")' },
            scheduled_at: { type: 'NUMBER' as any, description: 'When the meeting happened/will happen. Unix timestamp seconds. Defaults to now.' },
            owner:        { type: 'STRING' as any, description: 'Team member who attended' },
            notes:        { type: 'STRING' as any, description: 'Meeting notes' },
            value_bhd:    { type: 'NUMBER' as any, description: 'Potential deal value in BHD if mentioned' },
          },
          required: ['client_name'],
        },
      },
      {
        name: 'update_meeting_outcome',
        description: 'Update the outcome of a logged meeting and advance the related deal accordingly. closed → deal moves to won; follow_up → deal advances to negotiation; lost → deal moves to lost.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            meeting_id:    { type: 'NUMBER' as any, description: 'Meeting ID' },
            outcome:       { type: 'STRING' as any, description: 'closed | follow_up | lost | rescheduled' },
            value_bhd:     { type: 'NUMBER' as any, description: 'Final deal value if closed' },
            follow_up_at:  { type: 'NUMBER' as any, description: 'When to follow up next, if outcome is follow_up. Unix timestamp seconds.' },
            lost_reason:   { type: 'STRING' as any, description: 'Why the deal was lost' },
            notes:         { type: 'STRING' as any, description: 'Additional notes' },
          },
          required: ['meeting_id', 'outcome'],
        },
      },
      {
        name: 'list_meetings',
        description: 'List meetings, optionally filtered by outcome (pending = no outcome set yet) or owner or recent N days.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            outcome:    { type: 'STRING' as any, description: 'Filter: pending | closed | follow_up | lost' },
            owner:      { type: 'STRING' as any, description: 'Filter by owner team member' },
            since_days: { type: 'NUMBER' as any, description: 'Only meetings within the last N days' },
          },
          required: [],
        },
      },
      {
        name: 'create_deal',
        description: 'Create a sales deal (opportunity). Use for incoming leads. Defaults to lead stage.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            client_name:    { type: 'STRING' as any, description: 'Client this deal is with (auto-creates client)' },
            title:          { type: 'STRING' as any, description: 'Deal title' },
            value_bhd:      { type: 'NUMBER' as any, description: 'Estimated deal value in BHD' },
            stage:          { type: 'STRING' as any, description: 'lead | qualified | meeting | proposal | negotiation' },
            owner:          { type: 'STRING' as any, description: 'Owning team member' },
            expected_close: { type: 'NUMBER' as any, description: 'Expected close date as unix timestamp seconds' },
          },
          required: ['title'],
        },
      },
      {
        name: 'move_deal',
        description: 'Move a deal to a new pipeline stage.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            deal_id: { type: 'NUMBER' as any, description: 'Deal ID' },
            stage:   { type: 'STRING' as any, description: 'lead | qualified | meeting | proposal | negotiation | won | lost' },
            notes:   { type: 'STRING' as any, description: 'Why' },
          },
          required: ['deal_id', 'stage'],
        },
      },
      {
        name: 'mark_deal_won',
        description: 'Mark a deal as won. Returns confirmation; user can then start fulfillment with start_fulfillment. project_type infers from client (existing client → custom, no client / Lamma → lamma).',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            deal_id:         { type: 'NUMBER' as any, description: 'Deal ID' },
            final_value_bhd: { type: 'NUMBER' as any, description: 'Confirmed final value' },
            project_name:    { type: 'STRING' as any, description: 'Fulfillment project name (defaults to deal title)' },
            project_type:    { type: 'STRING' as any, description: 'custom (30-day default) or lamma (3-day default). If omitted, inferred from client.' },
            target_delivery: { type: 'NUMBER' as any, description: 'Delivery deadline as unix timestamp seconds. Defaults to kickoff + 30d (custom) or +3d (lamma).' },
            kickoff_at:      { type: 'NUMBER' as any, description: 'Kickoff timestamp; defaults to now' },
          },
          required: ['deal_id'],
        },
      },
      {
        name: 'mark_deal_lost',
        description: 'Mark a deal as lost. ALWAYS capture the lost reason.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            deal_id:     { type: 'NUMBER' as any, description: 'Deal ID' },
            lost_reason: { type: 'STRING' as any, description: 'Reason this deal was lost (price, competitor, no decision, etc.)' },
          },
          required: ['deal_id', 'lost_reason'],
        },
      },
      {
        name: 'list_pipeline',
        description: 'Show the sales pipeline — all open deals grouped by stage with totals. Use whenever the team asks about pipeline, deals, or sales status.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            owner:  { type: 'STRING' as any, description: 'Filter by deal owner' },
            stage:  { type: 'STRING' as any, description: 'Filter by single stage' },
            client: { type: 'STRING' as any, description: 'Filter by client name' },
          },
          required: [],
        },
      },
      {
        name: 'pipeline_value',
        description: 'Get total open pipeline value (BHD) and weighted forecast (probability-weighted).',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            owner: { type: 'STRING' as any, description: 'Filter by owner' },
          },
          required: [],
        },
      },
      {
        name: 'sales_stats',
        description: 'Win rate, avg deal value, avg time to close, and top lost reason over the past 90 days.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            days_back: { type: 'NUMBER' as any, description: 'Lookback window in days (default 90)' },
          },
          required: [],
        },
      },
      // ── Fulfillment tools ──────────────────────────────
      {
        name: 'start_fulfillment',
        description: 'Start a fulfillment project from a won deal. Auto-generates default milestones (5 for custom 30d, 3 for lamma 3d). If project_type omitted, inferred from deal client. If target_delivery omitted, uses type default.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            deal_id:         { type: 'NUMBER' as any, description: 'Deal ID this fulfills' },
            project_name:    { type: 'STRING' as any, description: 'Project name (defaults to "<Client> — <Deal title>")' },
            project_type:    { type: 'STRING' as any, description: 'custom (30-day default) or lamma (3-day default)' },
            target_delivery: { type: 'NUMBER' as any, description: 'Delivery deadline as unix timestamp seconds' },
            kickoff_at:      { type: 'NUMBER' as any, description: 'Kickoff timestamp; defaults to now' },
            notes:           { type: 'STRING' as any, description: 'Project notes' },
          },
          required: ['deal_id'],
        },
      },
      {
        name: 'add_milestone',
        description: 'Add a custom milestone to a fulfillment project.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            fulfillment_id: { type: 'NUMBER' as any, description: 'Fulfillment project ID' },
            title:          { type: 'STRING' as any, description: 'Milestone title' },
            target_date:    { type: 'NUMBER' as any, description: 'Due date as unix timestamp seconds' },
            phase:          { type: 'STRING' as any, description: 'kickoff | implementation | training | adoption | validation | live | done' },
          },
          required: ['fulfillment_id', 'title', 'target_date'],
        },
      },
      {
        name: 'complete_milestone',
        description: 'Mark a milestone as done.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            milestone_id: { type: 'NUMBER' as any, description: 'Milestone ID' },
            notes:        { type: 'STRING' as any, description: 'Notes about completion' },
          },
          required: ['milestone_id'],
        },
      },
      {
        name: 'update_fulfillment_phase',
        description: 'Advance a fulfillment project to a new phase.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            fulfillment_id: { type: 'NUMBER' as any, description: 'Fulfillment project ID' },
            phase:          { type: 'STRING' as any, description: 'kickoff | implementation | training | adoption | validation | live | done' },
          },
          required: ['fulfillment_id', 'phase'],
        },
      },
      {
        name: 'mark_fulfillment_at_risk',
        description: 'Flag a fulfillment project as at risk and capture the reason.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            fulfillment_id: { type: 'NUMBER' as any, description: 'Fulfillment project ID' },
            reason:         { type: 'STRING' as any, description: 'Why it is at risk' },
          },
          required: ['fulfillment_id', 'reason'],
        },
      },
      {
        name: 'complete_fulfillment',
        description: 'Mark a fulfillment project as DONE (project delivered).',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            fulfillment_id: { type: 'NUMBER' as any, description: 'Fulfillment project ID' },
            notes:          { type: 'STRING' as any, description: 'Closing notes' },
          },
          required: ['fulfillment_id'],
        },
      },
      {
        name: 'list_active_fulfillments',
        description: 'List active fulfillment projects (in delivery), optionally filtered by owner.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            owner: { type: 'STRING' as any, description: 'Filter by owner' },
          },
          required: [],
        },
      },
      {
        name: 'fulfillment_status',
        description: 'Get full status of a fulfillment project including all milestones and progress.',
        parameters: {
          type: 'OBJECT' as any,
          properties: {
            fulfillment_id: { type: 'NUMBER' as any, description: 'Fulfillment project ID' },
          },
          required: ['fulfillment_id'],
        },
      },
    ],
  },
];
