import { Client, GatewayIntentBits, Partials, Events, type TextChannel } from 'discord.js';
import { env } from '../config/env';
import { registerHandlers } from './handler';

export let discordClient: Client | null = null;

export async function connectToDiscord(): Promise<Client> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [
      Partials.Message,
      Partials.Channel,
      Partials.Reaction,
    ],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`\n✅ Discord bot ready! Logged in as ${c.user.tag}`);
    console.log(`📡 Serving ${c.guilds.cache.size} server(s)\n`);
  });

  registerHandlers(client);

  await client.login(env.DISCORD_TOKEN);
  discordClient = client;
  return client;
}

export async function sendToReportChannel(options: { content?: string; embeds?: any[] }): Promise<void> {
  if (!discordClient || !env.DISCORD_REPORT_CHANNEL_ID) return;
  try {
    const channel = await discordClient.channels.fetch(env.DISCORD_REPORT_CHANNEL_ID) as TextChannel;
    await channel.send(options);
  } catch (err) {
    console.error('Failed to send to report channel:', err);
  }
}

export async function sendToAIChannel(options: { content?: string; embeds?: any[] }): Promise<void> {
  if (!discordClient || !env.DISCORD_AI_CHANNEL_ID) return;
  try {
    const channel = await discordClient.channels.fetch(env.DISCORD_AI_CHANNEL_ID) as TextChannel;
    await channel.send(options);
  } catch (err) {
    console.error('Failed to send to AI channel:', err);
  }
}
