import { db } from '../db/index';
import { userMemories } from '../db/schema';
import { eq } from 'drizzle-orm';
import { genAI } from './gemini';
import { env } from '../config/env';

export function getUserMemory(userId: string): string {
  const row = db.select().from(userMemories).where(eq(userMemories.userId, userId)).get();
  return row?.memory ?? '';
}

export async function updateUserMemory(
  userId: string,
  username: string,
  userMessage: string,
  botReply: string,
): Promise<void> {
  const current = getUserMemory(userId);

  const model = genAI.getGenerativeModel({ model: env.GEMINI_MODEL });

  const prompt = `You manage a compact memory profile for a team member in a Discord bot.

Current profile:
${current || '(empty)'}

New exchange:
User (${username}): ${userMessage}
Bot: ${botReply}

Update the profile with any NEW facts worth remembering: name, role, preferences, ongoing projects, tasks, decisions made, important dates, or anything personal they shared.
Rules:
- Keep it under 150 words
- Plain text, no JSON
- Only include facts useful for future conversations
- Remove outdated info if replaced by new info
- If nothing new, return the current profile unchanged
Return ONLY the updated profile text, nothing else.`;

  try {
    const result = await model.generateContent(prompt);
    const updated = result.response.text().trim();
    if (!updated) return;

    db.insert(userMemories)
      .values({ userId, username, memory: updated, updatedAt: Math.floor(Date.now() / 1000) })
      .onConflictDoUpdate({
        target: userMemories.userId,
        set: { username, memory: updated, updatedAt: Math.floor(Date.now() / 1000) },
      })
      .run();
  } catch (err) {
    console.error('Memory update failed:', err);
  }
}
