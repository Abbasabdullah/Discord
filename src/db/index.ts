import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { env } from '../config/env';
import * as fs from 'fs';
import * as path from 'path';

// Ensure data directory exists
const dbDir = path.dirname(env.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite: DatabaseType = new Database(env.DB_PATH);

// Enable WAL mode for better concurrent performance
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

// Run migrations inline (create tables if not exist)
export function runMigrations() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      description TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open',
      priority    TEXT NOT NULL DEFAULT 'medium',
      created_by  TEXT NOT NULL,
      assigned_to TEXT,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      closed_at   INTEGER
    );

    CREATE TABLE IF NOT EXISTS conversation_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number TEXT NOT NULL,
      role         TEXT NOT NULL,
      content      TEXT NOT NULL,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS report_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      sent_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      recipient    TEXT NOT NULL,
      ticket_count INTEGER NOT NULL,
      status       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL,
      username   TEXT NOT NULL,
      message    TEXT NOT NULL,
      remind_at  INTEGER NOT NULL,
      sent       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS user_memories (
      user_id    TEXT PRIMARY KEY,
      username   TEXT,
      memory     TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Project field on tickets (safe — ALTER TABLE is idempotent via try/catch)
  try { sqlite.exec(`ALTER TABLE tickets ADD COLUMN project TEXT`); } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE tickets ADD COLUMN due_date INTEGER`); } catch { /* already exists */ }

  // ── Sales CRM + Fulfillment ─────────────────────────
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      contact_email TEXT,
      contact_phone TEXT,
      notes         TEXT,
      owner         TEXT,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS deals (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id       INTEGER,
      title           TEXT NOT NULL,
      value_bhd       REAL NOT NULL DEFAULT 0,
      stage           TEXT NOT NULL DEFAULT 'lead',
      owner           TEXT,
      expected_close  INTEGER,
      lost_reason     TEXT,
      notes           TEXT,
      won_at          INTEGER,
      lost_at         INTEGER,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
    CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner);
    CREATE INDEX IF NOT EXISTS idx_deals_client ON deals(client_id);

    CREATE TABLE IF NOT EXISTS meetings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id     INTEGER,
      deal_id       INTEGER,
      title         TEXT NOT NULL,
      scheduled_at  INTEGER NOT NULL,
      owner         TEXT,
      status        TEXT NOT NULL DEFAULT 'planned',
      outcome       TEXT NOT NULL DEFAULT 'pending',
      follow_up_at  INTEGER,
      value_bhd     REAL,
      notes         TEXT,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_meetings_outcome ON meetings(outcome);
    CREATE INDEX IF NOT EXISTS idx_meetings_follow_up ON meetings(follow_up_at);

    CREATE TABLE IF NOT EXISTS fulfillment_projects (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id           INTEGER,
      client_id         INTEGER,
      project_name      TEXT NOT NULL,
      project_type      TEXT NOT NULL DEFAULT 'custom',
      plane_project_id  TEXT,
      kickoff_at        INTEGER NOT NULL,
      target_delivery   INTEGER NOT NULL,
      current_phase     TEXT NOT NULL DEFAULT 'kickoff',
      status            TEXT NOT NULL DEFAULT 'active',
      last_check_in     INTEGER,
      owner             TEXT,
      notes             TEXT,
      created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
      completed_at      INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_fp_status ON fulfillment_projects(status);

    CREATE TABLE IF NOT EXISTS fulfillment_milestones (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      fulfillment_id  INTEGER NOT NULL,
      title           TEXT NOT NULL,
      phase           TEXT NOT NULL,
      target_date     INTEGER NOT NULL,
      completed_at    INTEGER,
      status          TEXT NOT NULL DEFAULT 'pending',
      plane_issue_id  TEXT,
      notes           TEXT,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_fm_fp ON fulfillment_milestones(fulfillment_id);
    CREATE INDEX IF NOT EXISTS idx_fm_target ON fulfillment_milestones(target_date);
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sales_targets (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start     INTEGER NOT NULL,
      week_end       INTEGER NOT NULL,
      target_amount  REAL NOT NULL,
      current_amount REAL NOT NULL DEFAULT 0,
      currency       TEXT NOT NULL DEFAULT 'BHD',
      notes          TEXT,
      created_at     INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      content    TEXT NOT NULL,
      context    TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS roadmap_items (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      title        TEXT NOT NULL,
      description  TEXT,
      status       TEXT NOT NULL DEFAULT 'planned',
      priority     TEXT NOT NULL DEFAULT 'medium',
      category     TEXT,
      target_date  INTEGER,
      created_by   TEXT NOT NULL,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS roadmap_attachments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id       INTEGER NOT NULL,
      filename      TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type     TEXT NOT NULL,
      size          INTEGER NOT NULL,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}

export const getSqlite = (): DatabaseType => sqlite;
