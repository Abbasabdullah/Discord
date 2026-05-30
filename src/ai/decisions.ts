import { getSqlite } from '../db/index';

export interface Decision {
  id: number;
  content: string;
  context: string | null;
  createdBy: string;
  createdAt: number;
}

export function logDecision(content: string, createdBy: string, context?: string): Decision {
  const db = getSqlite();
  const result = db.prepare(
    `INSERT INTO decisions (content, context, created_by) VALUES (?, ?, ?) RETURNING *`
  ).get(content, context ?? null, createdBy) as any;
  return mapRow(result);
}

export function getDecisions(limit = 20, search?: string): Decision[] {
  const db = getSqlite();
  if (search) {
    const rows = db.prepare(
      `SELECT * FROM decisions WHERE LOWER(content) LIKE LOWER(?) ORDER BY created_at DESC LIMIT ?`
    ).all(`%${search}%`, limit) as any[];
    return rows.map(mapRow);
  }
  const rows = db.prepare(
    `SELECT * FROM decisions ORDER BY created_at DESC LIMIT ?`
  ).all(limit) as any[];
  return rows.map(mapRow);
}

function mapRow(row: any): Decision {
  return {
    id:        row.id,
    content:   row.content,
    context:   row.context ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
