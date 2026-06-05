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

  let loopCount    = 0;
  const MAX_LOOPS  = 10;
  let currentMessage: string | any[] = text;
  let madeToolCall = false;
  let emptyNudged  = false;

  while (loopCount < MAX_LOOPS) {
    loopCount++;
    console.log(`🔄 Loop ${loopCount}/${MAX_LOOPS} — sending ${typeof currentMessage === 'string' ? 'text' : 'functionResponse'}`);

    let result, response;
    try {
      result   = await chat.sendMessage(currentMessage);
      response = result.response;
    } catch (err: any) {
      console.error(`❌ Gemini sendMessage error (loop ${loopCount}):`, err?.message ?? err);
      // If history is causing the issue, clear and retry once
      if (loopCount === 1) {
        console.log('🔄 Clearing history and retrying...');
        clearHistory(userId);
        chat = configuredModel.startChat({ history: [] });
        currentMessage = text;
        continue;
      }
      throw err;
    }

    const functionCalls = response.functionCalls();
    const candidate = response.candidates?.[0];
    console.log(`📥 Response: ${functionCalls?.length ?? 0} tool calls, text length: ${(() => { try { return response.text().length; } catch { return 0; } })()}, finishReason: ${candidate?.finishReason}, parts: ${candidate?.content?.parts?.length ?? 0}`);
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      console.log('🚫 Full candidate:', JSON.stringify(candidate, null, 2));
    }
    if (response.promptFeedback?.blockReason) {
      console.log('🚫 Prompt blocked:', JSON.stringify(response.promptFeedback));
    }

    if (functionCalls && functionCalls.length > 0) {
      madeToolCall = true;
      const responseParts = functionCalls.map(fc => {
        const toolResult = executeTool(fc.name, fc.args as any, username ?? userId);
        console.log(`🔧 Tool ${fc.name} → ${toolResult.length} chars`);
        return {
          functionResponse: {
            name:     fc.name,
            response: { result: toolResult },
          },
        };
      });
      currentMessage = responseParts;
      continue;
    }

    let finalText = '';
    try { finalText = response.text().trim(); } catch { /* response had no text part */ }

    if (finalText) {
      saveModelText(userId, finalText);
      trimHistory(userId);
      updateUserMemory(userId, username ?? userId, text, finalText).catch(console.error);
      return finalText;
    }

    // Gemini returned empty text. If a tool was called, nudge ONCE to format results.
    if (madeToolCall) {
      console.log('⚡ Empty response after tool call — nudging Gemini...');
      madeToolCall = false;
      currentMessage = 'Please now format and display the tool results clearly to the user, grouped by team member as instructed.';
      continue;
    }

    // No tool call AND empty text — Gemini ghosted us. Nudge once with explicit instruction.
    if (!emptyNudged) {
      console.log('⚡ Empty response, no tool call — nudging with explicit instruction...');
      emptyNudged = true;
      currentMessage = `The user asked: "${text}"\n\nPlease respond now. If they're asking about tasks, call list_tickets. If they're asking about sales, call get_sales_status. Otherwise, give a direct answer.`;
      continue;
    }

    console.log('⚠️ Empty response after nudge, breaking');
    break;
  }

  // Save a placeholder so history stays alternating (user/model)
  const fallback = '⚠️ Something went wrong. Please try again.';
  saveModelText(userId, fallback);
  trimHistory(userId);
  return fallback;
}
