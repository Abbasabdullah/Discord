/**
 * Canonical team members.
 * When assigning tickets, always normalize to one of these names.
 */
export const TEAM_MEMBERS = ['Hasan', 'Hussain', 'Abbas', 'Anas'] as const;
export type TeamMember = typeof TEAM_MEMBERS[number];

/**
 * Known Discord usernames → canonical team member name.
 * Add new mappings here whenever a member uses a different Discord handle.
 */
const DISCORD_USERNAME_MAP: Record<string, string> = {
  'abbas_lamma':      'Abbas',
  '7snmadan':         'Hasan',
  'bahraindesigners': 'Hussain', // best guess — update if wrong
};

/**
 * Map any name variation, Discord username, or nickname to the canonical name.
 * Returns the canonical name if matched, or the original string if no match.
 */
export function normalizeAssignee(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  const lower   = trimmed.toLowerCase();

  // Exact Discord username match first
  if (DISCORD_USERNAME_MAP[lower]) return DISCORD_USERNAME_MAP[lower];

  // Fuzzy name match
  if (lower.includes('hasan')  || lower === '7sn')                  return 'Hasan';
  if (lower.includes('hussain') || lower.includes('husain') ||
      lower.includes('hussein') || lower.includes('husein'))        return 'Hussain';
  if (lower.includes('abbas')  || lower.includes('abas'))           return 'Abbas';
  if (lower.includes('anas')   || lower === 'ansa')                 return 'Anas';

  // No match — return as-is
  return trimmed;
}
