/**
 * Sync helpers — bot data → Plane.
 *
 * All functions catch their own errors and log. Plane outages must not
 * block the bot. Returns null on failure rather than throwing.
 */
import * as plane from './client';
import type { FulfillmentProject } from '../fulfillment/fulfillment.service';
import { getFulfillment, updateFulfillment } from '../fulfillment/fulfillment.service';
import type { Milestone } from '../fulfillment/milestones.service';
import { getSqlite } from '../db/index';

const PRIORITY_MAP: Record<string, plane.CreateIssueInput['priority']> = {
  urgent: 'urgent', high: 'high', medium: 'medium', low: 'low',
};

/**
 * After a fulfillment project is created in the bot, mirror it into Plane
 * as a project. Stores plane_project_id back on the fulfillment row.
 *
 * Returns the plane_project_id, or null if disabled / failed.
 */
export async function syncFulfillmentToProject(f: FulfillmentProject): Promise<string | null> {
  if (!plane.isEnabled()) return null;
  if (f.planeProjectId) return f.planeProjectId;

  try {
    const project = await plane.findOrCreateProject(f.projectName, undefined, `Fulfillment for ${f.projectName}`);
    updateFulfillment(f.id, { planeProjectId: project.id });
    return project.id;
  } catch (err) {
    console.error('[Plane sync] syncFulfillmentToProject failed:', (err as Error).message);
    return null;
  }
}

/**
 * Mirror a milestone as an issue in the matching Plane project.
 * Returns the plane_issue_id or null.
 */
export async function syncMilestoneToIssue(milestone: Milestone): Promise<string | null> {
  if (!plane.isEnabled()) return null;
  if (milestone.planeIssueId) return milestone.planeIssueId;

  try {
    const fulfillment = getFulfillment(milestone.fulfillmentId);
    if (!fulfillment) return null;

    // Make sure the project exists
    let planeProjectId = fulfillment.planeProjectId;
    if (!planeProjectId) {
      planeProjectId = await syncFulfillmentToProject(fulfillment);
      if (!planeProjectId) return null;
    }

    const targetDate = new Date(milestone.targetDate * 1000).toISOString().slice(0, 10);
    const issue = await plane.createIssue(planeProjectId, {
      name:         milestone.title,
      description:  `Phase: ${milestone.phase}\nFrom fulfillment #${fulfillment.id}: ${fulfillment.projectName}`,
      target_date:  targetDate,
      priority:     'medium',
    });

    // Store the plane_issue_id
    getSqlite().prepare(
      `UPDATE fulfillment_milestones SET plane_issue_id = ? WHERE id = ?`
    ).run(issue.id, milestone.id);

    return issue.id;
  } catch (err) {
    console.error('[Plane sync] syncMilestoneToIssue failed:', (err as Error).message);
    return null;
  }
}

/**
 * Close (mark complete in Plane) the issue corresponding to a milestone.
 */
export async function closeMilestoneIssue(milestone: Milestone): Promise<void> {
  if (!plane.isEnabled()) return;
  if (!milestone.planeIssueId) return;
  try {
    const fulfillment = getFulfillment(milestone.fulfillmentId);
    if (!fulfillment?.planeProjectId) return;
    await plane.closeIssue(fulfillment.planeProjectId, milestone.planeIssueId);
  } catch (err) {
    console.error('[Plane sync] closeMilestoneIssue failed:', (err as Error).message);
  }
}

/**
 * Convenience: after `startFulfillment` returns a project + milestones array,
 * fire off Plane sync for both (best-effort).
 */
export async function syncNewFulfillment(project: FulfillmentProject, milestones: Milestone[]): Promise<void> {
  if (!plane.isEnabled()) return;
  const planeProjectId = await syncFulfillmentToProject(project);
  if (!planeProjectId) return;
  // Re-fetch project to get the updated planeProjectId for each milestone sync
  const refreshed = getFulfillment(project.id);
  if (!refreshed) return;
  for (const m of milestones) {
    await syncMilestoneToIssue(m);
  }
}
