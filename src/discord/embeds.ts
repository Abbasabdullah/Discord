import { EmbedBuilder, Colors } from 'discord.js';
import type { Ticket } from '../db/schema';

const STATUS_COLOR: Record<string, number> = {
  open:        Colors.Red,
  in_progress: Colors.Yellow,
  pending:     Colors.Orange,
  closed:      Colors.Green,
};

const STATUS_EMOJI: Record<string, string> = {
  open:        '🔴 Open',
  in_progress: '🟡 In Progress',
  pending:     '⏸️ Pending',
  closed:      '🟢 Closed',
};

const PRIORITY_EMOJI: Record<string, string> = {
  low:    '🟦 Low',
  medium: '🟩 Medium',
  high:   '🟧 High',
  urgent: '🚨 Urgent',
};

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function daysSince(unix: number): string {
  const days = Math.floor((Date.now() / 1000 - unix) / 86400);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export function ticketEmbed(ticket: Ticket): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(STATUS_COLOR[ticket.status] ?? Colors.Grey)
    .setTitle(`🎟️ Ticket #${ticket.id} — ${ticket.title}`)
    .addFields(
      { name: 'Status',      value: STATUS_EMOJI[ticket.status]     ?? ticket.status,   inline: true },
      { name: 'Priority',    value: PRIORITY_EMOJI[ticket.priority]  ?? ticket.priority, inline: true },
      { name: 'Assigned To', value: ticket.assignedTo ?? '_Unassigned_',                 inline: true },
      { name: 'Description', value: ticket.description },
      { name: 'Created',     value: `${formatDate(ticket.createdAt)} (${daysSince(ticket.createdAt)})`, inline: true },
      ...(ticket.closedAt
        ? [{ name: 'Closed', value: formatDate(ticket.closedAt), inline: true }]
        : []),
    )
    .setFooter({ text: `ID: ${ticket.id} • Created by ${ticket.createdBy}` })
    .setTimestamp();
}

export function reportEmbed(tickets: Ticket[], date: string, companyName: string): EmbedBuilder {
  const open        = tickets.filter(t => t.status === 'open');
  const in_progress = tickets.filter(t => t.status === 'in_progress');
  const pending     = tickets.filter(t => t.status === 'pending');

  const fmt = (list: Ticket[]) => {
    if (list.length === 0) return '_None_';
    const lines = list.map(t => `• **#${t.id}** ${t.title} — ${PRIORITY_EMOJI[t.priority] ?? t.priority}${t.assignedTo ? ` @${t.assignedTo}` : ''}`);
    let result = '';
    let shown = 0;
    for (const line of lines) {
      if ((result + '\n' + line).length > 1000) {
        result += `\n_…and ${list.length - shown} more_`;
        break;
      }
      result += (result ? '\n' : '') + line;
      shown++;
    }
    return result;
  };

  const embed = new EmbedBuilder()
    .setColor(tickets.length === 0 ? Colors.Green : Colors.Blue)
    .setTitle(`📋 Daily Support Report — ${date}`)
    .setFooter({ text: companyName })
    .setTimestamp();

  if (tickets.length === 0) {
    embed.setDescription('✅ All clear! No open tickets today.');
    return embed;
  }

  embed.addFields(
    { name: `🔴 Open (${open.length})`,               value: fmt(open) },
    { name: `🟡 In Progress (${in_progress.length})`, value: fmt(in_progress) },
    { name: `⏸️ Pending (${pending.length})`,         value: fmt(pending) },
    { name: '📊 Total',                               value: `**${tickets.length}** open ticket${tickets.length !== 1 ? 's' : ''}` },
  );

  return embed;
}

export function reminderEmbed(tickets: Ticket[], companyName: string): EmbedBuilder {
  const urgent     = tickets.filter(t => t.priority === 'urgent');
  const high       = tickets.filter(t => t.priority === 'high');
  const unassigned = tickets.filter(t => !t.assignedTo);

  const fmt = (list: Ticket[]) => {
    const lines = list.map(t => `• **#${t.id}** ${t.title}${t.assignedTo ? ` — @${t.assignedTo}` : ' — ⚠️ unassigned'}`);
    let result = '';
    let shown = 0;
    for (const line of lines) {
      if ((result + '\n' + line).length > 1000) {
        result += `\n_…and ${list.length - shown} more_`;
        break;
      }
      result += (result ? '\n' : '') + line;
      shown++;
    }
    return result || '_None_';
  };

  if (tickets.length === 0) {
    return new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('🌙 Evening Reminder')
      .setDescription('✅ Great work today! No open tickets remaining.')
      .setFooter({ text: companyName })
      .setTimestamp();
  }

  const embed = new EmbedBuilder()
    .setColor(Colors.Orange)
    .setTitle(`🌙 Evening Reminder — ${tickets.length} ticket${tickets.length !== 1 ? 's' : ''} still open`)
    .setFooter({ text: companyName })
    .setTimestamp();

  if (urgent.length > 0) embed.addFields({ name: `🚨 Urgent (${urgent.length})`, value: fmt(urgent) });
  if (high.length > 0)   embed.addFields({ name: `🟧 High Priority (${high.length})`, value: fmt(high) });
  if (unassigned.length > 0) embed.addFields({ name: `👤 Unassigned (${unassigned.length})`, value: fmt(unassigned) });

  const others = tickets.filter(t => t.priority !== 'urgent' && t.priority !== 'high' && t.assignedTo);
  if (others.length > 0) embed.addFields({ name: `📋 Others (${others.length})`, value: fmt(others) });

  return embed;
}

export function listEmbed(tickets: Ticket[], title: string): EmbedBuilder {
  if (tickets.length === 0) {
    return new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle(title)
      .setDescription('✅ No tickets found.');
  }

  const lines = tickets.map(t =>
    `**#${t.id}** ${t.title}\n${STATUS_EMOJI[t.status] ?? t.status} · ${PRIORITY_EMOJI[t.priority] ?? t.priority}${t.assignedTo ? ` · @${t.assignedTo}` : ''}`
  );

  return new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle(title)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}` });
}
