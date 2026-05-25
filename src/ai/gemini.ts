import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';

export const genAI = new GoogleGenerativeAI(env.GOOGLE_API_KEY);

export function getModel() {
  return genAI.getGenerativeModel({ model: env.GEMINI_MODEL });
}
