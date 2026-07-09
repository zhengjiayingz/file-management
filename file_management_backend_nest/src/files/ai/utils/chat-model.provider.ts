import { createOpenAI } from '@ai-sdk/openai';
import { requireEnv } from '@/files/ai/utils/env.util';

export function getChatModel() {
  const client = createOpenAI({
    apiKey: requireEnv('AI_API_KEY'),
    baseURL: process.env.AI_BASE_URL?.trim() || 'https://api.deepseek.com',
  });
  return client.chat(process.env.AI_MODEL?.trim() || 'deepseek-chat');
}
