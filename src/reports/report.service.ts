import { getOpenTicketsForReport } from '../tickets/ticket.service';
import { reportEmbed, reminderEmbed } from '../discord/embeds';
import { env } from '../config/env';
import type { EmbedBuilder } from 'discord.js';

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: env.REPORT_TIMEZONE,
  });
}

export function generateDailyReport(): { embed: EmbedBuilder; count: number } {
  const all       = getOpenTicketsForReport();
  const nonClosed = all.filter(t => t.status !== 'closed');
  const embed     = reportEmbed(nonClosed, formatDate(), env.COMPANY_NAME);
  return { embed, count: nonClosed.length };
}

export function generateEveningReminder(): { embed: EmbedBuilder; count: number } {
  const all       = getOpenTicketsForReport();
  const nonClosed = all.filter(t => t.status !== 'closed');
  const embed     = reminderEmbed(nonClosed, env.COMPANY_NAME);
  return { embed, count: nonClosed.length };
}
