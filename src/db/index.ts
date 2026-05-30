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
  `);
}

export const getSqlite = (): DatabaseType => sqlite;
