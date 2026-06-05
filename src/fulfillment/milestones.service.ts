import { getSqlite } from '../db/index';

export type MilestoneStatus = 'pending' | 'in_progress' | 'done' | 'overdue';

export interface Milestone {
  id:             number;
  fulfillmentId:  number;
  title:          string;
  phase:          string;
  targetDate:     number;
  completedAt:    number | null;
  status:         MilestoneStatus;
  planeIssueId:   string | null;
  notes:          string | null;
  createdAt:      number;
}

export function createMilestone(input: {
  fulfillmentId: number;
  title:         string;
  phase:         string;
  targetDate:    number;
  notes?:        string;
  planeIssueId?: string;
}): Milestone {
  const db = getSqlite();
  const row = db.prepare(
    `INSERT INTO fulfillment_milestones (fulfillment_id, title, phase, target_date, notes, plane_issue_id)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
  ).get(
    input.fulfillmentId,
    input.title,
    input.phase,
    input.targetDate,
    input.notes ?? null,
    input.planeIssueId ?? null,
  ) as any;
  return mapRow(row);
}

export function completeMilestone(id: number, notes?: string): Milestone | null {
  const db = getSqlite();
  db.prepare(
    `UPDATE fulfillment_milestones SET status = 'done', completed_at = ?, notes = COALESCE(?, notes)
     WHERE id = ?`
  ).run(Math.floor(Date.now() / 1000), notes ?? null, id);
  return getMilestone(id);
}

export function updateMilestoneStatus(id: number, status: MilestoneStatus): Milestone | null {
  const db = getSqlite();
  db.prepare(`UPDATE fulfillment_milestones SET status = ? WHERE id = ?`).run(status, id);
  return getMilestone(id);
}

export function getMilestone(id: number): Milestone | null {
  const db = getSqlite();
  const row = db.prepare(`SELECT * FROM fulfillment_milestones WHERE id = ?`).get(id) as any;
  return row ? mapRow(row) : null;
}

export function listMilestonesFor(fulfillmentId: number): Milestone[] {
  const db = getSqlite();
  const rows = db.prepare(
    `SELECT * FROM fulfillment_milestones WHERE fulfillment_id = ? ORDER BY target_date ASC`
  ).all(fulfillmentId) as any[];
  return rows.map(mapRow);
}

/** All milestones across all active fulfillments that are overdue and not yet done. */
export function getOverdueMilestones(): Array<Milestone & { projectName: string; owner: string | null }> {
  const db = getSqlite();
  const now = Math.floor(Date.now() / 1000);
  const rows = db.prepare(`
    SELECT m.*, p.project_name, p.owner FROM fulfillment_milestones m
    JOIN fulfillment_projects p ON p.id = m.fulfillment_id
    WHERE m.completed_at IS NULL AND m.target_date < ? AND p.status = 'active'
    ORDER BY m.target_date ASC
  `).all(now) as any[];
  return rows.map(r => ({ ...mapRow(r), projectName: r.project_name, owner: r.owner ?? null }));
}

function mapRow(row: any): Milestone {
  return {
    id:            row.id,
    fulfillmentId: row.fulfillment_id,
    title:         row.title,
    phase:         row.phase,
    targetDate:    row.target_date,
    completedAt:   row.completed_at ?? null,
    status:        row.status as MilestoneStatus,
    planeIssueId:  row.plane_issue_id ?? null,
    notes:         row.notes ?? null,
    createdAt:     row.created_at,
  };
}
