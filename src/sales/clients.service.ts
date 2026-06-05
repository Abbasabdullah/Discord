import { getSqlite } from '../db/index';

export interface Client {
  id: number;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  owner: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateClientInput {
  name: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  owner?: string;
}

export function createClient(input: CreateClientInput): Client {
  const db = getSqlite();
  const row = db.prepare(
    `INSERT INTO clients (name, contact_email, contact_phone, notes, owner)
     VALUES (?, ?, ?, ?, ?) RETURNING *`
  ).get(
    input.name.trim(),
    input.contactEmail ?? null,
    input.contactPhone ?? null,
    input.notes ?? null,
    input.owner ?? null,
  ) as any;
  return mapRow(row);
}

/** Find by exact or fuzzy name match (case-insensitive). */
export function findClientByName(name: string): Client | null {
  if (!name) return null;
  const db = getSqlite();
  // Exact case-insensitive
  let row = db.prepare(`SELECT * FROM clients WHERE LOWER(name) = LOWER(?)`).get(name.trim()) as any;
  if (row) return mapRow(row);
  // Substring fuzzy match (prefer the most recent one if multiple)
  row = db.prepare(
    `SELECT * FROM clients WHERE LOWER(name) LIKE LOWER(?) ORDER BY updated_at DESC LIMIT 1`
  ).get(`%${name.trim()}%`) as any;
  return row ? mapRow(row) : null;
}

export function getClient(id: number): Client | null {
  const db = getSqlite();
  const row = db.prepare(`SELECT * FROM clients WHERE id = ?`).get(id) as any;
  return row ? mapRow(row) : null;
}

/** Find existing client by name OR create one. Returns the client. */
export function findOrCreateClient(name: string, owner?: string): Client {
  const existing = findClientByName(name);
  if (existing) return existing;
  return createClient({ name, owner });
}

export function listClients(owner?: string): Client[] {
  const db = getSqlite();
  const rows = owner
    ? db.prepare(`SELECT * FROM clients WHERE LOWER(owner) = LOWER(?) ORDER BY name`).all(owner) as any[]
    : db.prepare(`SELECT * FROM clients ORDER BY name`).all() as any[];
  return rows.map(mapRow);
}

export function updateClient(id: number, patch: Partial<CreateClientInput>): Client | null {
  const db = getSqlite();
  const updates: string[] = ['updated_at = ?'];
  const params: any[] = [Math.floor(Date.now() / 1000)];
  if (patch.name !== undefined) { updates.push('name = ?'); params.push(patch.name); }
  if (patch.contactEmail !== undefined) { updates.push('contact_email = ?'); params.push(patch.contactEmail); }
  if (patch.contactPhone !== undefined) { updates.push('contact_phone = ?'); params.push(patch.contactPhone); }
  if (patch.notes !== undefined) { updates.push('notes = ?'); params.push(patch.notes); }
  if (patch.owner !== undefined) { updates.push('owner = ?'); params.push(patch.owner); }
  params.push(id);
  db.prepare(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getClient(id);
}

function mapRow(row: any): Client {
  return {
    id:           row.id,
    name:         row.name,
    contactEmail: row.contact_email ?? null,
    contactPhone: row.contact_phone ?? null,
    notes:        row.notes ?? null,
    owner:        row.owner ?? null,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  };
}
