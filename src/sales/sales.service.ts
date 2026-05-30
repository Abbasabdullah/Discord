import { getSqlite } from '../db/index';

export interface SalesTarget {
  id: number;
  weekStart: number;
  weekEnd: number;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  notes: string | null;
  createdAt: number;
}

/** Returns Monday 00:00:00 and Sunday 23:59:59 unix timestamps in Bahrain time */
export function getWeekBounds(date: Date = new Date()): { weekStart: number; weekEnd: number } {
  // Work in Bahrain timezone (UTC+3)
  const bhOffsetMs = 3 * 60 * 60 * 1000;
  const localDate  = new Date(date.getTime() + bhOffsetMs);

  const day        = localDate.getUTCDay(); // 0=Sun, 1=Mon
  const daysToMon  = day === 0 ? -6 : 1 - day;

  const monday = new Date(localDate);
  monday.setUTCDate(localDate.getUTCDate() + daysToMon);
  monday.setUTCHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 0);

  return {
    weekStart: Math.floor((monday.getTime() - bhOffsetMs) / 1000),
    weekEnd:   Math.floor((sunday.getTime() - bhOffsetMs) / 1000),
  };
}

export function setWeeklyTarget(targetAmount: number, notes?: string, currency = 'BHD'): SalesTarget {
  const db = getSqlite();
  const { weekStart, weekEnd } = getWeekBounds();

  const existing = db.prepare(`SELECT * FROM sales_targets WHERE week_start = ?`).get(weekStart) as any;

  if (existing) {
    db.prepare(`UPDATE sales_targets SET target_amount = ?, notes = ?, currency = ? WHERE id = ?`)
      .run(targetAmount, notes ?? existing.notes, currency, existing.id);
  } else {
    db.prepare(
      `INSERT INTO sales_targets (week_start, week_end, target_amount, current_amount, currency, notes)
       VALUES (?, ?, ?, 0, ?, ?)`
    ).run(weekStart, weekEnd, targetAmount, currency, notes ?? null);
  }

  return getCurrentTarget()!;
}

export function updatePipeline(currentAmount: number): SalesTarget | null {
  const db = getSqlite();
  const target = getCurrentTarget();
  if (!target) return null;
  db.prepare(`UPDATE sales_targets SET current_amount = ? WHERE id = ?`).run(currentAmount, target.id);
  return getCurrentTarget();
}

export function addToPipeline(amount: number): SalesTarget | null {
  const db = getSqlite();
  const target = getCurrentTarget();
  if (!target) return null;
  db.prepare(`UPDATE sales_targets SET current_amount = current_amount + ? WHERE id = ?`).run(amount, target.id);
  return getCurrentTarget();
}

export function getCurrentTarget(): SalesTarget | null {
  const db = getSqlite();
  const { weekStart } = getWeekBounds();
  const row = db.prepare(`SELECT * FROM sales_targets WHERE week_start = ?`).get(weekStart) as any;
  return row ? mapRow(row) : null;
}

export function getTargetHistory(limit = 8): SalesTarget[] {
  const db = getSqlite();
  const rows = db.prepare(`SELECT * FROM sales_targets ORDER BY week_start DESC LIMIT ?`).all(limit) as any[];
  return rows.map(mapRow);
}

function mapRow(row: any): SalesTarget {
  return {
    id:            row.id,
    weekStart:     row.week_start,
    weekEnd:       row.week_end,
    targetAmount:  row.target_amount,
    currentAmount: row.current_amount,
    currency:      row.currency,
    notes:         row.notes ?? null,
    createdAt:     row.created_at,
  };
}
