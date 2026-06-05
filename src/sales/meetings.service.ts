import { getSqlite } from '../db/index';
import { findOrCreateClient } from './clients.service';
import { createDeal, getDeal, updateDeal, type Deal } from './deals.service';

export type MeetingStatus  = 'planned' | 'held' | 'rescheduled' | 'cancelled';
export type MeetingOutcome = 'pending' | 'closed' | 'follow_up' | 'lost' | 'rescheduled';

export interface Meeting {
  id:          number;
  clientId:    number | null;
  clientName:  string | null;
  dealId:      number | null;
  title:       string;
  scheduledAt: number;
  owner:       string | null;
  status:      MeetingStatus;
  outcome:     MeetingOutcome;
  followUpAt:  number | null;
  valueBhd:    number | null;
  notes:       string | null;
  createdAt:   number;
  updatedAt:   number;
}

export interface LogMeetingInput {
  clientName?: string;
  clientId?:   number;
  dealId?:     number;
  title?:      string;        // defaults to "Meeting with <client>"
  scheduledAt?: number;       // unix; defaults to now
  owner?:      string;
  notes?:      string;
  valueBhd?:   number;
}

/**
 * Log a meeting. If the client doesn't exist, create it.
 * If neither dealId nor existing matching deal, create a lead-stage deal.
 */
export function logMeeting(input: LogMeetingInput): { meeting: Meeting; deal: Deal | null; clientCreated: boolean } {
  const db = getSqlite();
  let clientId = input.clientId ?? null;
  let clientCreated = false;
  if (!clientId && input.clientName) {
    const existed = require('./clients.service').findClientByName(input.clientName);
    const client = findOrCreateClient(input.clientName, input.owner);
    clientCreated = !existed;
    clientId = client.id;
  }

  let dealId = input.dealId ?? null;
  let deal: Deal | null = null;
  if (dealId) {
    deal = getDeal(dealId);
  } else if (clientId) {
    // Auto-create a lead-stage deal if there's no open one for this client
    const openForClient = require('./deals.service').listDeals({ clientId, openOnly: true });
    if (openForClient.length === 0) {
      deal = createDeal({
        clientId,
        title: input.title ?? `Opportunity from meeting`,
        valueBhd: input.valueBhd ?? 0,
        stage: 'meeting',  // we're already at meeting stage by definition
        owner: input.owner,
      });
      dealId = deal.id;
    } else {
      const candidate = openForClient[0] as Deal;
      dealId = candidate.id;
      // Move deal forward to meeting stage if it's still in lead/qualified
      if (candidate.stage === 'lead' || candidate.stage === 'qualified') {
        updateDeal(candidate.id, { stage: 'meeting' });
      }
      deal = getDeal(candidate.id);
    }
  }

  const scheduledAt = input.scheduledAt ?? Math.floor(Date.now() / 1000);
  const title = input.title ?? (input.clientName ? `Meeting with ${input.clientName}` : 'Client meeting');

  const row = db.prepare(
    `INSERT INTO meetings (client_id, deal_id, title, scheduled_at, owner, status, outcome, value_bhd, notes)
     VALUES (?, ?, ?, ?, ?, 'held', 'pending', ?, ?) RETURNING *`
  ).get(
    clientId,
    dealId,
    title,
    scheduledAt,
    input.owner ?? null,
    input.valueBhd ?? null,
    input.notes ?? null,
  ) as any;

  return { meeting: enrich(row), deal, clientCreated };
}

export interface MeetingOutcomeInput {
  outcome:     MeetingOutcome;
  valueBhd?:   number;        // if closed, also updates the deal value
  followUpAt?: number;        // unix ts, required if outcome === 'follow_up'
  lostReason?: string;        // required if outcome === 'lost'
  notes?:      string;
}

/**
 * Update a meeting's outcome and propagate to its deal:
 *   closed     → deal.stage = 'won'  + valueBhd
 *   follow_up  → deal.stage = 'negotiation' (if not already past)
 *   lost       → deal.stage = 'lost' + lostReason
 */
export function updateMeetingOutcome(meetingId: number, input: MeetingOutcomeInput): { meeting: Meeting; deal: Deal | null } {
  const db = getSqlite();
  const existing = getMeeting(meetingId);
  if (!existing) throw new Error(`Meeting #${meetingId} not found`);

  db.prepare(
    `UPDATE meetings SET outcome = ?, follow_up_at = ?, value_bhd = COALESCE(?, value_bhd),
       notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`
  ).run(
    input.outcome,
    input.followUpAt ?? null,
    input.valueBhd ?? null,
    input.notes ?? null,
    Math.floor(Date.now() / 1000),
    meetingId,
  );

  let deal: Deal | null = existing.dealId ? getDeal(existing.dealId) : null;
  if (deal) {
    if (input.outcome === 'closed') {
      deal = updateDeal(deal.id, {
        stage: 'won',
        valueBhd: input.valueBhd ?? deal.valueBhd,
      });
    } else if (input.outcome === 'follow_up') {
      // Only advance the stage forward, never backward
      if (deal.stage === 'lead' || deal.stage === 'qualified' || deal.stage === 'meeting') {
        deal = updateDeal(deal.id, { stage: 'negotiation' });
      }
    } else if (input.outcome === 'lost') {
      deal = updateDeal(deal.id, { stage: 'lost', lostReason: input.lostReason });
    }
  }

  return { meeting: getMeeting(meetingId)!, deal };
}

export function getMeeting(id: number): Meeting | null {
  const db = getSqlite();
  const row = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(id) as any;
  return row ? enrich(row) : null;
}

export function listMeetings(filters: {
  owner?: string;
  outcome?: MeetingOutcome;
  clientId?: number;
  sinceDays?: number;
  limit?: number;
} = {}): Meeting[] {
  const db = getSqlite();
  let query = `SELECT * FROM meetings WHERE 1=1`;
  const params: any[] = [];
  if (filters.owner) { query += ` AND LOWER(owner) = LOWER(?)`; params.push(filters.owner); }
  if (filters.outcome) { query += ` AND outcome = ?`; params.push(filters.outcome); }
  if (filters.clientId) { query += ` AND client_id = ?`; params.push(filters.clientId); }
  if (filters.sinceDays) {
    query += ` AND scheduled_at >= ?`;
    params.push(Math.floor(Date.now() / 1000) - filters.sinceDays * 86400);
  }
  query += ` ORDER BY scheduled_at DESC`;
  if (filters.limit) { query += ` LIMIT ?`; params.push(filters.limit); }
  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(enrich);
}

/** Meetings held >12h ago whose outcome is still pending. Used by the cron chase. */
export function getMeetingsAwaitingOutcome(maxAgeHours = 36): Meeting[] {
  const db = getSqlite();
  const now = Math.floor(Date.now() / 1000);
  const minAgeCutoff = now - 12 * 3600;
  const maxAgeCutoff = now - maxAgeHours * 3600;
  const rows = db.prepare(
    `SELECT * FROM meetings WHERE outcome = 'pending' AND scheduled_at <= ? AND scheduled_at >= ?
     ORDER BY scheduled_at ASC`
  ).all(minAgeCutoff, maxAgeCutoff) as any[];
  return rows.map(enrich);
}

/** Meetings logged today (since today's start at 4 AM UTC roughly). */
export function getTodaysMeetings(): Meeting[] {
  const db = getSqlite();
  const todayStart = Math.floor(Date.now() / 1000) - (24 * 3600);
  const rows = db.prepare(
    `SELECT * FROM meetings WHERE scheduled_at >= ? ORDER BY scheduled_at ASC`
  ).all(todayStart) as any[];
  return rows.map(enrich);
}

function enrich(row: any): Meeting {
  let clientName: string | null = null;
  if (row.client_id) {
    const c = require('./clients.service').getClient(row.client_id);
    clientName = c?.name ?? null;
  }
  return {
    id:          row.id,
    clientId:    row.client_id ?? null,
    clientName,
    dealId:      row.deal_id ?? null,
    title:       row.title,
    scheduledAt: row.scheduled_at,
    owner:       row.owner ?? null,
    status:      row.status as MeetingStatus,
    outcome:     row.outcome as MeetingOutcome,
    followUpAt:  row.follow_up_at ?? null,
    valueBhd:    row.value_bhd ?? null,
    notes:       row.notes ?? null,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}
