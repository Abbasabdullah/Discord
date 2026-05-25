/**
 * Canonical team members.
 * When assigning tickets, always normalize to one of these names.
 */
export const TEAM_MEMBERS = ['Hasan', 'Hussain', 'Abbas', 'Anas'] as const;
export type TeamMember = typeof TEAM_MEMBERS[number];

/**
 * Map common variations / Discord usernames to the canonical name.
 * Returns the canonical name if matched, or the original string if no match.
 */
export function normalizeAssignee(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase().trim();

  if (lower.includes('hasan'))                                       return 'Hasan';
  if (lower.includes('hussain') || lower.includes('husain') ||
      lower.includes('hussein') || lower.includes('husein'))        return 'Hussain';
  if (lower.includes('abbas')   || lower.includes('abas'))          return 'Abbas';
  if (lower.includes('anas'))                                        return 'Anas';

  // No match — return as-is (don't silently drop unknown assignees)
  return raw.trim();
}
