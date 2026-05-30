import {
  type Client,
  type Interaction,
  type Message,
  Events,
  MessageFlags,
} from 'discord.js';
import * as ticketService from '../tickets/ticket.service';
import { handleMessage } from '../ai/conversation';
import { analyzeVoiceNote, extractMeetingData } from '../ai/voice';
import { logDecision } from '../ai/decisions';
import { normalizeAssignee } from '../utils/team';
import { ticketEmbed, listEmbed } from './embeds';
import { ticketButtons } from './commands';
import { generateDailyReport } from '../reports/report.service';
import { env } from '../config/env';

export function registerHandlers(client: Client) {
  // ── Slash commands + button clicks ─────────────────────────────
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        await handleButton(interaction);
      }
    } catch (err) {
      console.error('Interaction error:', err);
      const msg = { content: '⚠️ Something went wrong. Please try again.', flags: MessageFlags.Ephemeral };
      if (interaction.isRepliable()) {
        if ((interaction as any).replied || (interaction as any).deferred) {
          await (interaction as any).followUp(msg);
        } else {
          await (interaction as any).reply(msg);
        }
      }
    }
  });

  // ── Natural language via @mention or DM ────────────────────────
  client.on(Events.MessageCreate, async (rawMessage: Message) => {
    // Fetch full message if partial
    const message = rawMessage.partial ? await rawMessage.fetch() : rawMessage;

    console.log(`📩 Message from ${message.author?.username ?? 'unknown'}: "${message.content?.slice(0, 60) ?? ''}"`);

    if (message.author?.bot) { console.log('⏭ Skipped: bot message'); return; }

    const isMentioned   = message.mentions.has(client.user!);
    const isDM          = message.channel.isDMBased();
    const isAIChannel   = env.DISCORD_AI_CHANNEL_ID
                            ? message.channel.id === env.DISCORD_AI_CHANNEL_ID
                            : false;

    console.log(`🔍 isMentioned=${isMentioned} isDM=${isDM} isAIChannel=${isAIChannel}`);

    // Respond if: message in AI channel, DM, or @mention anywhere
    if (!isMentioned && !isDM && !isAIChannel) { console.log('⏭ Skipped: not a target channel/mention'); return; }

    const userId   = message.author.id;
    const username = message.author.username;

    // ── Voice message detection ───────────────────────────────
    const audioAttachment = message.attachments.find(a =>
      a.contentType?.startsWith('audio/') || a.name?.endsWith('.ogg')
    );

    if (audioAttachment) {
      console.log(`🎙️ Voice note from ${username}`);
      if ('sendTyping' in message.channel) await message.channel.sendTyping();
      try {
        const analysis = await analyzeVoiceNote(audioAttachment.url, username);
        let reply = `🎙️ **Voice Note Analysis**\n\n${analysis}`;

        // Second pass: extract tasks and decisions automatically
        try {
          const meetingData = await extractMeetingData(analysis);

          if (meetingData.tasks.length > 0) {
            const createdLines: string[] = [];
            for (const task of meetingData.tasks) {
              const ticket = ticketService.createTicket({
                title:       task.title,
                description: task.title,
                priority:    task.priority ?? 'medium',
                assignedTo:  normalizeAssignee(task.assignee),
                project:     task.project,
                createdBy:   username,
              });
              const assignStr = ticket.assignedTo ? ` → ${ticket.assignedTo}` : '';
              const projStr   = ticket.project    ? ` [${ticket.project}]`     : '';
              createdLines.push(`• #${ticket.id} ${ticket.title}${assignStr}${projStr}`);
            }
            reply += `\n\n✅ **Auto-created ${meetingData.tasks.length} task(s):**\n${createdLines.join('\n')}`;
          }

          if (meetingData.decisions.length > 0) {
            for (const d of meetingData.decisions) {
              logDecision(d.content, username, d.context);
            }
            reply += `\n\n📝 **Logged ${meetingData.decisions.length} decision(s)**`;
          }
        } catch (extractErr) {
          console.error('Task extraction error:', extractErr);
          // Don't fail the whole response — analysis was already good
        }

        // Split if over Discord's 2000 char limit
        if (reply.length <= 2000) {
          await message.reply(reply);
        } else {
          await message.reply(reply.slice(0, 1997) + '…');
        }
      } catch (err) {
        console.error('Voice analysis error:', err);
        await message.reply('⚠️ Failed to analyze the voice note. Please try again.');
      }
      return;
    }

    // Strip @mention if present
    const text = message.content
      .replace(/<@!?\d+>/g, '')
      .trim();

    // No text — only ignore if there are truly no attachments either
    if (!text && message.attachments.size === 0) return;

    // Has attachments but no text — describe them to the AI
    const attachmentDesc = message.attachments.size > 0 && !text
      ? message.attachments.map(a => `[File attached: ${a.name} (${a.contentType ?? 'unknown type'})]`).join('\n')
      : '';

    if ('sendTyping' in message.channel) await message.channel.sendTyping();

    try {
      const finalText = text || attachmentDesc;
      const reply = await handleMessage(userId, finalText, username);

      // Discord has 2000 char limit — split if needed
      if (reply.length <= 2000) {
        await message.reply(reply);
      } else {
        const chunks: string[] = [];
        let remaining = reply;
        while (remaining.length > 0) {
          if (remaining.length <= 2000) { chunks.push(remaining); break; }
          let splitAt = remaining.lastIndexOf('\n', 2000);
          if (splitAt < 500) splitAt = 2000;
          chunks.push(remaining.slice(0, splitAt));
          remaining = remaining.slice(splitAt).trim();
        }
        await message.reply(chunks[0]);
        for (let i = 1; i < chunks.length; i++) {
          if ('send' in message.channel) await message.channel.send(chunks[i]);
        }
      }
    } catch (err) {
      console.error('Message handling error:', err);
      await message.reply('⚠️ Something went wrong. Please try again.');
    }
  });
}

// ── Slash command router ────────────────────────────────────────
async function handleSlashCommand(interaction: any) {
  const { commandName } = interaction;
  const userId   = interaction.user.id;
  const username = interaction.user.username;

  switch (commandName) {
    case 'create-ticket': {
      await interaction.deferReply();

      const title = interaction.options.getString('title', true);
      const ticket = ticketService.createTicket({
        title,
        description: interaction.options.getString('description') ?? title,
        priority:   interaction.options.getString('priority') as any ?? 'medium',
        assignedTo: interaction.options.getString('assign_to') ?? undefined,
        createdBy:  username,
      });

      // Show the new ticket + full list of all open tickets
      const allTickets = ticketService.listTickets({ limit: 50 });
      const openTickets = allTickets.filter(t => t.status !== 'closed');

      await interaction.editReply({
        embeds: [
          ticketEmbed(ticket),
          listEmbed(openTickets, `📋 All Open Tickets (${openTickets.length})`),
        ],
        components: [ticketButtons(ticket.id, false)],
      });
      break;
    }

    case 'ticket': {
      await interaction.deferReply();

      const id     = interaction.options.getInteger('id', true);
      const ticket = ticketService.getTicket(id);

      if (!ticket) {
        await interaction.editReply(`❌ Ticket #${id} not found.`);
        return;
      }

      await interaction.editReply({
        embeds:     [ticketEmbed(ticket)],
        components: [ticketButtons(ticket.id, ticket.status === 'closed')],
      });
      break;
    }

    case 'list-tickets': {
      await interaction.deferReply();

      const filters = {
        status:     interaction.options.getString('status')      as any ?? undefined,
        priority:   interaction.options.getString('priority')    as any ?? undefined,
        assignedTo: interaction.options.getString('assigned_to') ?? undefined,
        limit:      20,
      };

      const tickets = ticketService.listTickets(filters);
      const title   = buildListTitle(filters);

      await interaction.editReply({ embeds: [listEmbed(tickets, title)] });
      break;
    }

    case 'update-ticket': {
      await interaction.deferReply();

      const id     = interaction.options.getInteger('id', true);
      const ticket = ticketService.updateTicket(id, {
        status:      interaction.options.getString('status')      as any ?? undefined,
        priority:    interaction.options.getString('priority')    as any ?? undefined,
        assignedTo:  interaction.options.getString('assign_to')   ?? undefined,
        description: interaction.options.getString('description') ?? undefined,
      });

      if (!ticket) {
        await interaction.editReply(`❌ Ticket #${id} not found.`);
        return;
      }

      await interaction.editReply({
        content:    '✅ Ticket updated!',
        embeds:     [ticketEmbed(ticket)],
        components: [ticketButtons(ticket.id, ticket.status === 'closed')],
      });
      break;
    }

    case 'close-ticket': {
      await interaction.deferReply();

      const id     = interaction.options.getInteger('id', true);
      const ticket = ticketService.closeTicket(id);

      if (!ticket) {
        await interaction.editReply(`❌ Ticket #${id} not found.`);
        return;
      }

      await interaction.editReply({
        content:    `🟢 Ticket #${id} closed!`,
        embeds:     [ticketEmbed(ticket)],
        components: [ticketButtons(ticket.id, true)],
      });
      break;
    }

    case 'ask': {
      await interaction.deferReply();
      const question = interaction.options.getString('question', true);
      const reply    = await handleMessage(userId, question, username);
      await interaction.editReply(reply);
      break;
    }

    case 'report': {
      await interaction.deferReply();
      const { embed } = generateDailyReport();
      await interaction.editReply({ content: '📋 Here\'s the current report:', embeds: [embed] });
      break;
    }
  }
}

// ── Button handler ──────────────────────────────────────────────
async function handleButton(interaction: any) {
  const [action, idStr] = interaction.customId.split(':');
  const ticketId = parseInt(idStr, 10);
  const username = interaction.user.username;

  await interaction.deferUpdate();

  switch (action) {
    case 'close': {
      const ticket = ticketService.closeTicket(ticketId);
      if (!ticket) return;
      await interaction.editReply({
        content:    `🟢 Closed by **${username}**`,
        embeds:     [ticketEmbed(ticket)],
        components: [ticketButtons(ticket.id, true)],
      });
      break;
    }

    case 'assign_me': {
      const ticket = ticketService.updateTicket(ticketId, { assignedTo: username });
      if (!ticket) return;
      await interaction.editReply({
        content:    `👤 Assigned to **${username}**`,
        embeds:     [ticketEmbed(ticket)],
        components: [ticketButtons(ticket.id, ticket.status === 'closed')],
      });
      break;
    }

    case 'escalate': {
      const current = ticketService.getTicket(ticketId);
      if (!current) return;
      const nextPriority: Record<string, 'medium' | 'high' | 'urgent'> = {
        low: 'medium', medium: 'high', high: 'urgent', urgent: 'urgent',
      };
      const ticket = ticketService.updateTicket(ticketId, {
        priority: nextPriority[current.priority],
      });
      if (!ticket) return;
      await interaction.editReply({
        content:    `🔼 Priority escalated to **${ticket.priority}** by **${username}**`,
        embeds:     [ticketEmbed(ticket)],
        components: [ticketButtons(ticket.id, ticket.status === 'closed')],
      });
      break;
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────
function buildListTitle(filters: { status?: string; priority?: string; assignedTo?: string }): string {
  const parts = ['Tickets'];
  if (filters.status)     parts.push(`· ${filters.status.replace('_', ' ')}`);
  if (filters.priority)   parts.push(`· ${filters.priority}`);
  if (filters.assignedTo) parts.push(`· assigned to ${filters.assignedTo}`);
  return parts.join(' ');
}
