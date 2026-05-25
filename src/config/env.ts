import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';

// Load .env manually (no dotenv dependency needed in Node 22)
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key   = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const envSchema = z.object({
  // Google AI
  GOOGLE_API_KEY: z.string().min(1, 'GOOGLE_API_KEY is required — get it from https://aistudio.google.com/app/apikey'),
  GEMINI_MODEL:   z.string().default('gemini-2.0-flash'),

  // Discord
  DISCORD_TOKEN:             z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_CLIENT_ID:         z.string().min(1, 'DISCORD_CLIENT_ID is required'),
  DISCORD_GUILD_ID:          z.string().optional(),
  DISCORD_REPORT_CHANNEL_ID: z.string().optional(),
  DISCORD_AI_CHANNEL_ID:     z.string().optional(), // chat freely in this channel without @mention

  // Database
  DB_PATH: z.string().default('./data/tickets.db'),

  // Daily Report
  REPORT_CRON:     z.string().default('0 8 * * *'),
  REPORT_TIMEZONE: z.string().default('Asia/Dubai'),

  // Conversation
  MAX_HISTORY_TURNS: z.coerce.number().default(20),

  // Company
  COMPANY_NAME: z.string().default('My Team'),

  // Dashboard
  DASHBOARD_PASSWORD: z.string().optional(),
  DASHBOARD_PORT:     z.coerce.number().default(3000),

  // App
  NODE_ENV:  z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  parsed.error.issues.forEach(issue => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;
