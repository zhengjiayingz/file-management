import { createOpenAI } from '@ai-sdk/openai';

function requireAiApiKey(): string {
  const value = process.env.AI_API_KEY?.trim();
  if (!value) {
    throw new Error('Missing environment variable: AI_API_KEY');
  }
  return value;
}

export function getChatModel() {
  const client = createOpenAI({
    apiKey: requireAiApiKey(),
    baseURL: process.env.AI_BASE_URL?.trim() || 'https://api.deepseek.com',
  });
  return client.chat(process.env.AI_MODEL?.trim() || 'deepseek-chat');
}
