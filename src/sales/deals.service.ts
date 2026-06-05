import { getSqlite } from '../db/index';
import { findOrCreateClient, getClient } from './clients.service';

export type DealStage = 'lead' | 'qualified' | 'meeting' | 'proposal' | 'negotiation' | 'won' | 'lost';

export const STAGE_PROBABILITY: Record<DealStage, number> = {
  lead:        0.10,
  qualified:   0.25,
  meeting:     0.40,
  proposal:    0.60,
  negotiation: 0.80,
  won:         1.00,
  lost:        0.00,
};

export const STAGE_ORDER: DealStage[] = [
  'lead', 'qualified', 'meeting', 'proposal', 'negotiation', 'won', 'lost',
];

export interface Deal {
  id:            number;
  clientId:      number | null;
  clientName:    string | null;  // joined for convenience
  title:         string;
  valueBhd:      number;
  stage:         DealStage;
  owner:         string | null;
  expectedClose: number | null;
  lostReason:    string | null;
  notes:         string | null;
  wonAt:         number | null;
  lostAt:        number | null;
  createdAt:     number;
  updatedAt:     number;
}

export interface CreateDealInput {
  clientName?: string;
  clientId?:   number;
  title:       string;
  valueBhd?:   number;
  stage?:      DealStage;
  owner?:      string;
  expectedClose?: number;  // unix ts
  notes?:      string;
}

export function createDeal(input: CreateDealInput): Deal {
  const db = getSqlite();
  let clientId: number | null = input.clientId ?? null;
  if (!clientId && input.clientName) {
    clientId = findOrCreateClient(input.clientName, input.owner).id;
  }
  const row = db.prepare(
    `INSERT INTO deals (client_id, title, value_bhd, stage, owner, expected_close, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
  ).get(
    clientId,
    input.title.trim(),
    input.valueBhd ?? 0,
    input.stage ?? 'lead',
    input.owner ?? null,
    input.expectedClose ?? null,
    input.notes ?? null,
  ) as any;
  return enrich(row);
}

export function getDeal(id: number): Deal | null {
  const db = getSqlite();
  const row = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(id) as any;
  return row ? enrich(row) : null;
}

export interface UpdateDealInput {
  stage?:         DealStage;
  valueBhd?:      number;
  owner?:         string;
  expectedClose?: number;
  notes?:         string;
  lostReason?:    string;
}

export function updateDeal(id: number, patch: UpdateDealInput): Deal | null {
  const db = getSqlite();
  const updates: string[] = ['updated_at = ?'];
  const params: any[] = [Math.floor(Date.now() / 1000)];
  if (patch.stage !== undefined) { updates.push('stage = ?'); params.push(patch.stage); }
  if (patch.valueBhd !== undefined) { updates.push('value_bhd = ?'); params.push(patch.valueBhd); }
  if (patch.owner !== undefined) { updates.push('owner = ?'); params.push(patch.owner); }
  if (patch.expectedClose !== undefined) { updates.push('expected_close = ?'); params.push(patch.expectedClose); }
  if (patch.notes !== undefined) { updates.push('notes = ?'); params.push(patch.notes); }
  if (patch.lostReason !== undefined) { updates.push('lost_reason = ?'); params.push(patch.lostReason); }
  if (patch.stage === 'won') { updates.push('won_at = ?'); params.push(Math.floor(Date.now() / 1000)); }
  if (patch.stage === 'lost') { updates.push('lost_at = ?'); params.push(Math.floor(Date.now() / 1000)); }
  params.push(id);
  db.prepare(`UPDATE deals SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getDeal(id);
}

export function listDeals(filters: {
  owner?: string;
  stage?: DealStage;
  clientId?: number;
  openOnly?: boolean;
} = {}): Deal[] {
  const db = getSqlite();
  let query = `SELECT * FROM deals WHERE 1=1`;
  const params: any[] = [];
  if (filters.owner) { query += ` AND LOWER(owner) = LOWER(?)`; params.push(filters.owner); }
  if (filters.stage) { query += ` AND stage = ?`; params.push(filters.stage); }
  if (filters.clientId) { query += ` AND client_id = ?`; params.push(filters.clientId); }
  if (filters.openOnly) { query += ` AND stage NOT IN ('won', 'lost')`; }
  query += ` ORDER BY updated_at DESC`;
  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(enrich);
}

/** Open deals grouped by stage, with value totals per stage. */
export function getPipelineSummary(owner?: string) {
  const open = listDeals({ owner, openOnly: true });
  const byStage: Record<string, { count: number; value: number; deals: Deal[] }> = {};
  for (const stage of STAGE_ORDER) {
    if (stage === 'won' || stage === 'lost') continue;
    byStage[stage] = { count: 0, value: 0, deals: [] };
  }
  let openValue = 0;
  let weightedValue = 0;
  for (const d of open) {
    if (!byStage[d.stage]) byStage[d.stage] = { count: 0, value: 0, deals: [] };
    byStage[d.stage].count++;
    byStage[d.stage].value += d.valueBhd;
    byStage[d.stage].deals.push(d);
    openValue += d.valueBhd;
    weightedValue += d.valueBhd * (STAGE_PROBABILITY[d.stage] ?? 0);
  }
  return { byStage, openValue, weightedValue, totalDeals: open.length };
}

/** Compute basic win-rate stats over the past `daysBack` days. */
export function getSalesStats(daysBack = 90) {
  const db = getSqlite();
  const since = Math.floor(Date.now() / 1000) - daysBack * 86400;
  const closedRows = db.prepare(
    `SELECT stage, value_bhd, won_at, lost_at, created_at FROM deals
     WHERE (won_at >= ? OR lost_at >= ?)`
  ).all(since, since) as any[];
  const won = closedRows.filter((r: any) => r.stage === 'won');
  const lost = closedRows.filter((r: any) => r.stage === 'lost');
  const winRate = closedRows.length > 0 ? won.length / closedRows.length : 0;
  const avgValue = won.length > 0 ? won.reduce((s: number, r: any) => s + r.value_bhd, 0) / won.length : 0;
  const totalWonValue = won.reduce((s: number, r: any) => s + r.value_bhd, 0);
  // avg days to close (won only)
  const cycleTimes = won
    .filter((r: any) => r.won_at && r.created_at)
    .map((r: any) => (r.won_at - r.created_at) / 86400);
  const avgCycleDays = cycleTimes.length > 0
    ? cycleTimes.reduce((s: number, n: number) => s + n, 0) / cycleTimes.length
    : 0;
  // top lost reason
  const lostRows = db.prepare(
    `SELECT lost_reason, COUNT(*) as c FROM deals WHERE stage = 'lost' AND lost_reason IS NOT NULL AND lost_at >= ?
     GROUP BY lost_reason ORDER BY c DESC LIMIT 1`
  ).get(since) as any;
  return {
    winRate,
    wonCount:       won.length,
    lostCount:      lost.length,
    avgDealValue:   Math.round(avgValue * 100) / 100,
    totalWonValue:  Math.round(totalWonValue * 100) / 100,
    avgCycleDays:   Math.round(avgCycleDays * 10) / 10,
    topLostReason:  lostRows?.lost_reason ?? null,
  };
}

function enrich(row: any): Deal {
  const client = row.client_id ? getClient(row.client_id) : null;
  return {
    id:            row.id,
    clientId:      row.client_id ?? null,
    clientName:    client?.name ?? null,
    title:         row.title,
    valueBhd:      row.value_bhd,
    stage:         row.stage as DealStage,
    owner:         row.owner ?? null,
    expectedClose: row.expected_close ?? null,
    lostReason:    row.lost_reason ?? null,
    notes:         row.notes ?? null,
    wonAt:         row.won_at ?? null,
    lostAt:        row.lost_at ?? null,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}
