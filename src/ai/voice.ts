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
