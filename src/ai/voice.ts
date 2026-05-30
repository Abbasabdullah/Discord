import { genAI } from './gemini';
import { env } from '../config/env';
import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    client.get(url, res => {
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', err => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

export async function analyzeVoiceNote(audioUrl: string, senderName: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `voice_${Date.now()}.ogg`);

  try {
    await downloadFile(audioUrl, tmpPath);

    const audioData   = fs.readFileSync(tmpPath);
    const base64Audio = audioData.toString('base64');

    const model = genAI.getGenerativeModel({ model: env.GEMINI_MODEL });

    const result = await model.generateContent([
      {
        inlineData: {
          data:     base64Audio,
          mimeType: 'audio/ogg',
        },
      },
      {
        text: `This is a voice note from ${senderName} in Arabic. Please:
1. Transcribe the full audio in Arabic
2. Provide an English translation/summary
3. Extract any action items, decisions, or tasks mentioned
4. Format the output clearly with sections: 📝 Transcription (Arabic), 🌐 Summary (English), ✅ Action Items

Be thorough — this is a meeting recording.`,
      },
    ]);

    return result.response.text().trim();
  } finally {
    fs.unlink(tmpPath, () => {});
  }
}

export interface ExtractedMeetingData {
  tasks: Array<{
    title: string;
    assignee?: string;
    project?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  }>;
  decisions: Array<{
    content: string;
    context?: string;
  }>;
}

/**
 * Second-pass Gemini call on a voice note transcription.
 * Extracts structured tasks and decisions to be auto-created.
 */
export async function extractMeetingData(transcription: string): Promise<ExtractedMeetingData> {
  const model = genAI.getGenerativeModel({ model: env.GEMINI_MODEL });

  const prompt = `Analyze this meeting transcription and extract structured data.

Team members: Hasan, Hussain, Abbas, Anas

Transcription:
"""
${transcription}
"""

Return ONLY valid JSON (no markdown fences):
{
  "tasks": [
    { "title": "short action item description", "assignee": "Hasan", "project": "Magna", "priority": "medium" }
  ],
  "decisions": [
    { "content": "the decision made", "context": "why or background" }
  ]
}

Rules:
- tasks: only concrete action items / things to do mentioned (not discussions)
- assignee: match to team member name if mentioned, else omit
- project: infer from context if obvious, else omit
- priority: default "medium" unless urgency is clearly expressed
- decisions: hard decisions made, not opinions or discussions
- Return empty arrays if nothing found — never return null`;

  try {
    const result = await model.generateContent(prompt);
    const text   = result.response.text().trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(text);
  } catch {
    return { tasks: [], decisions: [] };
  }
}
