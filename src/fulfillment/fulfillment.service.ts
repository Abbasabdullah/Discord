import { getSqlite } from '../db/index';
import { getDeal } from '../sales/deals.service';
import { createMilestone, listMilestonesFor, type Milestone } from './milestones.service';

export type ProjectType  = 'custom' | 'lamma';
export type ProjectPhase = 'kickoff' | 'implementation' | 'training' | 'adoption' | 'validation' | 'live' | 'done';
export type ProjectStatus = 'active' | 'at_risk' | 'done' | 'cancelled';

export interface FulfillmentProject {
  id:              number;
  dealId:          number | null;
  clientId:        number | null;
  projectName:     string;
  projectType:     ProjectType;
  planeProjectId:  string | null;
  kickoffAt:       number;
  targetDelivery:  number;
  currentPhase:    ProjectPhase;
  status:          ProjectStatus;
  lastCheckIn:     number | null;
  owner:           string | null;
  notes:           string | null;
  createdAt:       number;
  completedAt:     number | null;
}

/**
 * Default milestone template per project type.
 * Returns [{ title, phase, dayOffset }, ...]
 */
export function defaultMilestoneTemplate(projectType: ProjectType): Array<{ title: string; phase: ProjectPhase; dayOffset: number }> {
  if (projectType === 'lamma') {
    return [
      { title: 'Kickoff',         phase: 'kickoff',        dayOffset: 0 },
      { title: 'Implementation',  phase: 'implementation', dayOffset: 1 },
      { title: 'Delivery / done', phase: 'done',           dayOffset: 3 },
    ];
  }
  // Custom (30 days)
  return [
    { title: 'Kickoff & requirements',  phase: 'kickoff',        dayOffset: 0 },
    { title: 'Implementation start',    phase: 'implementation', dayOffset: 7 },
    { title: 'Training / first review', phase: 'training',       dayOffset: 14 },
    { title: 'Validation / sign-off',   phase: 'validation',     dayOffset: 25 },
    { title: 'Delivery / handoff',      phase: 'done',           dayOffset: 30 },
  ];
}

export function defaultTargetDelivery(projectType: ProjectType, kickoffAt: number): number {
  return kickoffAt + (projectType === 'lamma' ? 3 : 30) * 86400;
}

export interface StartFulfillmentInput {
  dealId?:         number;
  clientId?:       number;
  projectName:     string;
  projectType:     ProjectType;
  planeProjectId?: string;
  kickoffAt?:      number;
  targetDelivery?: number;
  owner?:          string;
  notes?:          string;
}

/**
 * Create a fulfillment project AND generate default milestones for the type.
 */
export function startFulfillment(input: StartFulfillmentInput): { project: FulfillmentProject; milestones: Milestone[] } {
  const db = getSqlite();
  const kickoff = input.kickoffAt ?? Math.floor(Date.now() / 1000);
  const target = input.targetDelivery ?? defaultTargetDelivery(input.projectType, kickoff);

  const row = db.prepare(
    `INSERT INTO fulfillment_projects
       (deal_id, client_id, project_name, project_type, plane_project_id, kickoff_at, target_delivery, owner, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
  ).get(
    input.dealId ?? null,
    input.clientId ?? null,
    input.projectName,
    input.projectType,
    input.planeProjectId ?? null,
    kickoff,
    target,
    input.owner ?? null,
    input.notes ?? null,
  ) as any;
  const project = mapRow(row);

  // Auto-generate default milestones
  const template = defaultMilestoneTemplate(input.projectType);
  const milestones: Milestone[] = template.map(t =>
    createMilestone({
      fulfillmentId: project.id,
      title:         t.title,
      phase:         t.phase,
      targetDate:    kickoff + t.dayOffset * 86400,
    })
  );

  return { project, milestones };
}

/**
 * Auto-create a fulfillment from a won deal. Used by mark_deal_won.
 */
export function fulfillmentForWonDeal(dealId: number, opts: {
  projectName?:    string;
  projectType?:    ProjectType;
  kickoffAt?:      number;
  targetDelivery?: number;
}): { project: FulfillmentProject; milestones: Milestone[] } {
  const deal = getDeal(dealId);
  if (!deal) throw new Error(`Deal #${dealId} not found`);

  // Infer project_type if not provided
  let projectType: ProjectType = opts.projectType ?? 'custom';
  if (!opts.projectType) {
    if (!deal.clientName || deal.clientName.toLowerCase() === 'lamma') projectType = 'lamma';
  }

  const projectName = opts.projectName ?? `${deal.clientName ?? 'Internal'} — ${deal.title}`;

  return startFulfillment({
    dealId:         deal.id,
    clientId:       deal.clientId ?? undefined,
    projectName,
    projectType,
    kickoffAt:      opts.kickoffAt,
    targetDelivery: opts.targetDelivery,
    owner:          deal.owner ?? undefined,
  });
}

export function getFulfillment(id: number): FulfillmentProject | null {
  const db = getSqlite();
  const row = db.prepare(`SELECT * FROM fulfillment_projects WHERE id = ?`).get(id) as any;
  return row ? mapRow(row) : null;
}

export function updateFulfillment(id: number, patch: {
  currentPhase?:  ProjectPhase;
  status?:        ProjectStatus;
  lastCheckIn?:   number;
  notes?:         string;
  planeProjectId?: string;
}): FulfillmentProject | null {
  const db = getSqlite();
  const updates: string[] = [];
  const params: any[] = [];
  if (patch.currentPhase !== undefined) { updates.push('current_phase = ?'); params.push(patch.currentPhase); }
  if (patch.status !== undefined) { updates.push('status = ?'); params.push(patch.status); }
  if (patch.lastCheckIn !== undefined) { updates.push('last_check_in = ?'); params.push(patch.lastCheckIn); }
  if (patch.notes !== undefined) { updates.push('notes = ?'); params.push(patch.notes); }
  if (patch.planeProjectId !== undefined) { updates.push('plane_project_id = ?'); params.push(patch.planeProjectId); }
  if (patch.status === 'done') { updates.push('completed_at = ?'); params.push(Math.floor(Date.now() / 1000)); }
  if (updates.length === 0) return getFulfillment(id);
  params.push(id);
  db.prepare(`UPDATE fulfillment_projects SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getFulfillment(id);
}

export function listActiveFulfillments(owner?: string): FulfillmentProject[] {
  const db = getSqlite();
  const rows = owner
    ? db.prepare(`SELECT * FROM fulfillment_projects WHERE status IN ('active','at_risk') AND LOWER(owner) = LOWER(?) ORDER BY target_delivery ASC`).all(owner) as any[]
    : db.prepare(`SELECT * FROM fulfillment_projects WHERE status IN ('active','at_risk') ORDER BY target_delivery ASC`).all() as any[];
  return rows.map(mapRow);
}

export function getFulfillmentDetails(id: number): { project: FulfillmentProject; milestones: Milestone[] } | null {
  const project = getFulfillment(id);
  if (!project) return null;
  return { project, milestones: listMilestonesFor(id) };
}

/** Fulfillments where last_check_in > N days (or null). */
export function getFulfillmentsNeedingCheckIn(daysSince = 7): FulfillmentProject[] {
  const db = getSqlite();
  const cutoff = Math.floor(Date.now() / 1000) - daysSince * 86400;
  const rows = db.prepare(
    `SELECT * FROM fulfillment_projects WHERE status IN ('active','at_risk')
     AND (last_check_in IS NULL OR last_check_in < ?)
     ORDER BY target_delivery ASC`
  ).all(cutoff) as any[];
  return rows.map(mapRow);
}

/** Recently won deals with no fulfillment project yet. */
export function getWonDealsWithoutFulfillment(daysBack = 3): Array<{ deal_id: number; title: string; client_id: number | null; owner: string | null; won_at: number }> {
  const db = getSqlite();
  const since = Math.floor(Date.now() / 1000) - daysBack * 86400;
  return db.prepare(`
    SELECT d.id as deal_id, d.title, d.client_id, d.owner, d.won_at
    FROM deals d
    LEFT JOIN fulfillment_projects f ON f.deal_id = d.id
    WHERE d.stage = 'won' AND d.won_at >= ? AND f.id IS NULL
    ORDER BY d.won_at DESC
  `).all(since) as any[];
}

function mapRow(row: any): FulfillmentProject {
  return {
    id:              row.id,
    dealId:          row.deal_id ?? null,
    clientId:        row.client_id ?? null,
    projectName:     row.project_name,
    projectType:     row.project_type as ProjectType,
    planeProjectId:  row.plane_project_id ?? null,
    kickoffAt:       row.kickoff_at,
    targetDelivery:  row.target_delivery,
    currentPhase:    row.current_phase as ProjectPhase,
    status:          row.status as ProjectStatus,
    lastCheckIn:     row.last_check_in ?? null,
    owner:           row.owner ?? null,
    notes:           row.notes ?? null,
    createdAt:       row.created_at,
    completedAt:     row.completed_at ?? null,
  };
}
