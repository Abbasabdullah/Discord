/**
 * Run this once to register slash commands with Discord:
 *   npx tsx src/discord/register-commands.ts
 */
import '../config/env'; // must be first
import { REST, Routes } from 'discord.js';
import { commands } from './commands';
import { env } from '../config/env';

const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

async function main() {
  console.log('🔄 Registering slash commands...');

  const route = env.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID)
    : Routes.applicationCommands(env.DISCORD_CLIENT_ID);

  const data = await rest.put(route, { body: commands }) as any[];
  const scope = env.DISCORD_GUILD_ID ? 'guild (instant)' : 'global (up to 1 hour)';
  console.log(`✅ Registered ${data.length} commands — ${scope}`);
}

main().catch(console.error);
