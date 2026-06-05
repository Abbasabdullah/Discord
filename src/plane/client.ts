/**
 * Thin REST wrapper around the Plane self-hosted API.
 * Auth via X-Api-Key. Base URL and token come from env vars.
 *
 * Sync is intentionally one-way (bot → Plane). All errors are caught
 * by callers — Plane outages must not break the bot.
 */
import { env } from '../config/env';

const BASE = (env.PLANE_BASE_URL ?? 'http://194.163.157.202:8888').replace(/\/+$/, '');
const TOKEN = env.PLANE_API_TOKEN ?? '';
const WS    = env.PLANE_WORKSPACE_SLUG ?? 'lamma';

function headers(): Record<string, string> {
  return {
    'X-Api-Key':   TOKEN,
    'Content-Type': 'application/json',
  };
}

function isEnabled(): boolean {
  return !!TOKEN;
}

async function req(method: string, path: string, body?: any): Promise<any> {
  if (!isEnabled()) throw new Error('Plane API not configured (missing PLANE_API_TOKEN)');
  const url = `${BASE}/api/v1/workspaces/${WS}${path}`;
  const res = await fetch(url, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Plane API ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

// ── Projects ──────────────────────────────────────────────────
export interface PlaneProject {
  id: string;
  name: string;
  identifier: string;
  description?: string;
}

export async function getProjects(): Promise<PlaneProject[]> {
  const data = await req('GET', '/projects/');
  return (data?.results ?? data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    identifier: p.identifier,
    description: p.description,
  }));
}

export async function findProjectByName(name: string): Promise<PlaneProject | null> {
  const all = await getProjects();
  const lower = name.toLowerCase().trim();
  return all.find(p => p.name.toLowerCase() === lower) ?? null;
}

export async function createProject(name: string, identifier?: string, description?: string): Promise<PlaneProject> {
  // Identifier must be uppercase letters (max 12). Auto-generate from name if not provided.
  const id = (identifier ?? name.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6))
    || 'PROJ' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const body = {
    name:        name.slice(0, 100),
    identifier:  id,
    description: description ?? '',
    network:     2,  // private workspace project
  };
  const p = await req('POST', '/projects/', body);
  return { id: p.id, name: p.name, identifier: p.identifier, description: p.description };
}

export async function findOrCreateProject(name: string, identifier?: string, description?: string): Promise<PlaneProject> {
  const existing = await findProjectByName(name);
  if (existing) return existing;
  return createProject(name, identifier, description);
}

// ── States (Plane's columns) ──────────────────────────────────
export interface PlaneState {
  id: string;
  name: string;
  group: string;  // backlog | unstarted | started | completed | cancelled
}

export async function getStates(projectId: string): Promise<PlaneState[]> {
  const data = await req('GET', `/projects/${projectId}/states/`);
  return (data?.results ?? data ?? []).map((s: any) => ({ id: s.id, name: s.name, group: s.group }));
}

// ── Issues ────────────────────────────────────────────────────
export interface CreateIssueInput {
  name:        string;
  description?: string;
  priority?:   'urgent' | 'high' | 'medium' | 'low' | 'none';
  target_date?: string;  // YYYY-MM-DD
  assigneeIds?: string[];
  stateId?:    string;
}

export interface PlaneIssue {
  id: string;
  name: string;
  sequence_id?: number;
  state?: string;
}

export async function createIssue(projectId: string, input: CreateIssueInput): Promise<PlaneIssue> {
  const body: any = {
    name:        input.name.slice(0, 255),
    description_html: input.description ? `<p>${input.description}</p>` : '<p></p>',
    priority:    input.priority ?? 'medium',
  };
  if (input.target_date) body.target_date = input.target_date;
  if (input.assigneeIds && input.assigneeIds.length > 0) body.assignees = input.assigneeIds;
  if (input.stateId) body.state = input.stateId;
  const issue = await req('POST', `/projects/${projectId}/issues/`, body);
  return { id: issue.id, name: issue.name, sequence_id: issue.sequence_id, state: issue.state };
}

export async function updateIssue(projectId: string, issueId: string, patch: Partial<CreateIssueInput>): Promise<PlaneIssue> {
  const body: any = {};
  if (patch.name) body.name = patch.name;
  if (patch.description) body.description_html = `<p>${patch.description}</p>`;
  if (patch.priority) body.priority = patch.priority;
  if (patch.target_date) body.target_date = patch.target_date;
  if (patch.stateId) body.state = patch.stateId;
  const issue = await req('PATCH', `/projects/${projectId}/issues/${issueId}/`, body);
  return { id: issue.id, name: issue.name, sequence_id: issue.sequence_id, state: issue.state };
}

/** Find the completed-group state ID for a project, used to "close" issues. */
export async function getCompletedStateId(projectId: string): Promise<string | null> {
  const states = await getStates(projectId);
  return states.find(s => s.group === 'completed')?.id ?? null;
}

export async function closeIssue(projectId: string, issueId: string): Promise<void> {
  const completedState = await getCompletedStateId(projectId);
  if (!completedState) return;
  await req('PATCH', `/projects/${projectId}/issues/${issueId}/`, { state: completedState });
}

export { isEnabled };
