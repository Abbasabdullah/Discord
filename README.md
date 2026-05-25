# WhatsApp AI Support Ticket System

A WhatsApp chatbot powered by Claude AI for creating and managing support tickets conversationally, with automatic daily morning reports.

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Edit `.env` and fill in:
- `ANTHROPIC_API_KEY` — get from https://console.anthropic.com
- `REPORT_RECIPIENTS` — comma-separated phone numbers (no + sign, e.g. `5511999999999`)
- `COMPANY_NAME` — your team/company name
- `REPORT_TIMEZONE` — your timezone (e.g. `America/Sao_Paulo`, `Asia/Dubai`)

### 3. Run
```bash
npm run dev
```

### 4. Scan QR Code
When the app starts, a QR code appears in the terminal.
Open WhatsApp → Settings → Linked Devices → Link a Device → scan the QR.

✅ You're connected! The bot will now respond to WhatsApp messages.

---

## How to Use (via WhatsApp)

### Create a ticket
> "The login page is broken for customers"
> "Create a ticket for the payment gateway failing, high priority, assign to Maria"

### Check a ticket
> "Is ticket 5 done?"
> "Show me ticket 12"

### List tickets
> "Show all open tickets"
> "What's assigned to John?"
> "List urgent tickets"

### Update a ticket
> "Mark ticket 5 as in progress"
> "Assign ticket 8 to Maria"
> "Change ticket 3 to high priority"

### Close a ticket
> "Close ticket 7"
> "Ticket 10 is resolved"

---

## Daily Report

Every morning at the configured time, all report recipients receive:

```
📋 Daily Support Report — Monday, April 14, 2026
My Team

🔴 Open (2):
• #12 - Login broken (high) - @john
• #15 - CSV export fails (medium) - unassigned

🟡 In Progress (1):
• #10 - Slow dashboard (high) - @maria

📊 Total open: 3 tickets
```

To test the report immediately, temporarily set `REPORT_CRON=* * * * *` in `.env`.

---

## File Structure

```
src/
  index.ts              # Entry point
  config/env.ts         # Environment variables (Zod validated)
  db/
    schema.ts           # Database schema (Drizzle ORM)
    index.ts            # DB connection + migrations
  whatsapp/
    client.ts           # Baileys WhatsApp connection + QR
    sender.ts           # sendText() helper
    handler.ts          # Incoming message router
  ai/
    claude.ts           # Anthropic client
    tools.ts            # 5 Claude tool definitions
    system-prompt.ts    # AI personality + instructions
    conversation.ts     # Agentic loop (the core)
  tools/executor.ts     # Tool name → service function dispatch
  tickets/
    ticket.service.ts   # CRUD operations
    ticket.types.ts     # TypeScript types
  reports/
    report.service.ts   # Report text generator
    scheduler.ts        # node-cron daily job
data/
  tickets.db            # SQLite database (auto-created)
  auth/                 # WhatsApp session (auto-created, scan once)
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | ✅ | — | Your Claude API key |
| `DB_PATH` | — | `./data/tickets.db` | SQLite file path |
| `WA_AUTH_PATH` | — | `./data/auth` | Baileys session directory |
| `REPORT_CRON` | — | `0 8 * * *` | Cron for daily report (8 AM) |
| `REPORT_TIMEZONE` | — | `America/Sao_Paulo` | Timezone for cron |
| `REPORT_RECIPIENTS` | — | — | Comma-separated phone numbers |
| `MAX_HISTORY_TURNS` | — | `20` | Conversation memory window |
| `CLAUDE_MODEL` | — | `claude-sonnet-4-6` | Claude model to use |
| `COMPANY_NAME` | — | `My Team` | Used in reports and AI prompt |
