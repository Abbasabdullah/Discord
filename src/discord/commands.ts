import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('create-ticket')
    .setDescription('Create a new support ticket')
    .addStringOption(o => o.setName('title').setDescription('Short title for the ticket').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Full description of the issue (optional)').setRequired(false))
    .addStringOption(o =>
      o.setName('priority').setDescription('Priority level (default: medium)').setRequired(false)
        .addChoices(
          { name: '🟦 Low',      value: 'low' },
          { name: '🟩 Medium',   value: 'medium' },
          { name: '🟧 High',     value: 'high' },
          { name: '🚨 Urgent',   value: 'urgent' },
        )
    )
    .addStringOption(o => o.setName('assign_to').setDescription('Assign to someone (name or username)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('View a ticket by ID')
    .addIntegerOption(o => o.setName('id').setDescription('Ticket ID').setRequired(true)),

  new SlashCommandBuilder()
    .setName('list-tickets')
    .setDescription('List tickets with optional filters')
    .addStringOption(o =>
      o.setName('status').setDescription('Filter by status').setRequired(false)
        .addChoices(
          { name: '🔴 Open',          value: 'open' },
          { name: '🟡 In Progress',   value: 'in_progress' },
          { name: '⏸️ Pending',       value: 'pending' },
          { name: '🟢 Closed',        value: 'closed' },
        )
    )
    .addStringOption(o =>
      o.setName('priority').setDescription('Filter by priority').setRequired(false)
        .addChoices(
          { name: '🟦 Low',    value: 'low' },
          { name: '🟩 Medium', value: 'medium' },
          { name: '🟧 High',   value: 'high' },
          { name: '🚨 Urgent', value: 'urgent' },
        )
    )
    .addStringOption(o => o.setName('assigned_to').setDescription('Filter by assignee').setRequired(false)),

  new SlashCommandBuilder()
    .setName('update-ticket')
    .setDescription('Update an existing ticket')
    .addIntegerOption(o => o.setName('id').setDescription('Ticket ID').setRequired(true))
    .addStringOption(o =>
      o.setName('status').setDescription('New status').setRequired(false)
        .addChoices(
          { name: '🔴 Open',        value: 'open' },
          { name: '🟡 In Progress', value: 'in_progress' },
          { name: '⏸️ Pending',     value: 'pending' },
          { name: '🟢 Closed',      value: 'closed' },
        )
    )
    .addStringOption(o =>
      o.setName('priority').setDescription('New priority').setRequired(false)
        .addChoices(
          { name: '🟦 Low',    value: 'low' },
          { name: '🟩 Medium', value: 'medium' },
          { name: '🟧 High',   value: 'high' },
          { name: '🚨 Urgent', value: 'urgent' },
        )
    )
    .addStringOption(o => o.setName('assign_to').setDescription('Reassign to someone').setRequired(false))
    .addStringOption(o => o.setName('description').setDescription('Update description').setRequired(false)),

  new SlashCommandBuilder()
    .setName('close-ticket')
    .setDescription('Close/resolve a ticket')
    .addIntegerOption(o => o.setName('id').setDescription('Ticket ID').setRequired(true))
    .addStringOption(o => o.setName('note').setDescription('Resolution note (optional)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask the AI about tickets in plain language')
    .addStringOption(o => o.setName('question').setDescription('Your question or request').setRequired(true)),

  new SlashCommandBuilder()
    .setName('report')
    .setDescription('Manually trigger the daily ticket report'),
].map(c => c.toJSON());

// Buttons attached to ticket embeds
export function ticketButtons(ticketId: number, isClosed: boolean): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`close:${ticketId}`)
      .setLabel('✅ Close')
      .setStyle(ButtonStyle.Success)
      .setDisabled(isClosed),
    new ButtonBuilder()
      .setCustomId(`assign_me:${ticketId}`)
      .setLabel('👤 Assign to Me')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(isClosed),
    new ButtonBuilder()
      .setCustomId(`escalate:${ticketId}`)
      .setLabel('🔼 Escalate')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(isClosed),
  );
}
