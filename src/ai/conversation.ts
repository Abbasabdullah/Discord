import { type Content } from '@google/generative-ai';
import { TOOLS } from './tools';
import { getSystemPrompt } from './system-prompt';
import { executeTool } from '../tools/executor';
import { getUserMemory, updateUserMemory } from './memory';
import { db } from '../db/index';
import { conversationHistory } from '../db/schema';
import { eq, asc } from 'drizzle-orm';
import { env } from '../config/env';
import { genAI } from './gemini';

const SHORT_HISTORY_TURNS = 6;

function loadRecentHistory(userId: string): Content[] {
  const rows = db
    .select()
    .from(conversationHistory)
    .where(eq(conversationHistory.phoneNumber, userId))
    .orderBy(asc(conversationHistory.id))   // id is always sequential, unlike createdAt
    .all()
    .slice(-SHORT_HISTORY_TURNS);

  const contents: Content[] = rows.map(row => ({
    role:  row.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: row.content }],
  }));

  // Gemini requires history to start with a user turn and alternate roles
  const firstUserIdx = contents.findIndex(c => c.role === 'user');
  if (firstUserIdx < 0) return [];                              // no user messages at all
  return contents.slice(firstUserIdx);
}

function clearHistory(userId: string) {
  db.delete(conversationHistory).where(eq(conversationHistory.phoneNumber, userId)).run();
}

function saveUserText(userId: string, text: string) {
  db.insert(conversationHistory).values({ phoneNumber: userId, role: 'user', content: text }).run();
}

function saveModelText(userId: string, text: string) {
  db.insert(conversationHistory).values({ phoneNumber: userId, role: 'assistant', content: text }).run();
}

function trimHistory(userId: string) {
  const rows = db
    .select()
    .from(conversationHistory)
    .where(eq(conversationHistory.phoneNumber, userId))
    .orderBy(asc(conversationHistory.id))
    .all();

  if (rows.length > SHORT_HISTORY_TURNS) {
    let keep = rows.slice(-SHORT_HISTORY_TURNS);
    // Ensure kept rows start with a user message
    while (keep.length > 0 && keep[0].role !== 'user') {
      keep = keep.slice(1);
    }
    const keepIds = new Set(keep.map(r => r.id));
    for (const row of rows) {
      if (!keepIds.has(row.id)) {
        db.delete(conversationHistory).where(eq(conversationHistory.id, row.id)).run();
      }
    }
  }
}

export async function handleMessage(userId: string, text: string, username?: string): Promise<string> {
  const memory  = getUserMemory(userId);
  let   history = loadRecentHistory(userId);

  const configuredModel = genAI.getGenerativeModel({
    model:             env.GEMINI_MODEL,
    tools:             TOOLS,
    systemInstruction: getSystemPrompt(username, memory),
  });

  let chat;
  try {
    chat = configuredModel.startChat({ history });
  } catch {
    // History is corrupt — clear it and start fresh
    clearHistory(userId);
    history = [];
    chat = configuredModel.startChat({ history });
  }

  saveUserText(userId, text);

  let loopCount = 0;
  const MAX_LOOPS = 10;
  let currentMessage: string | any[] = text;

  while (loopCount < MAX_LOOPS) {
    loopCount++;

    const result        = await chat.sendMessage(currentMessage);
    const response      = result.response;
    const functionCalls = response.functionCalls();

    if (functionCalls && functionCalls.length > 0) {
      const responseParts = functionCalls.map(fc => ({
        functionResponse: {
          name:     fc.name,
          response: { result: executeTool(fc.name, fc.args as any, username ?? userId) },
        },
      }));
      currentMessage = responseParts;
      continue;
    }

    const finalText = response.text().trim();
    saveModelText(userId, finalText);
    trimHistory(userId);

    // Update memory in background (don't await — keep response fast)
    updateUserMemory(userId, username ?? userId, text, finalText).catch(console.error);

    return finalText || "I'm here to help! What would you like to do?";
  }

  return '⚠️ Something went wrong. Please try again.';
}
