import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

const nestEnv = resolve(__dirname, '../.env');
const expressEnv = resolve(__dirname, '../../file_management_backend/.env');

if (existsSync(nestEnv)) {
  dotenv.config({ path: nestEnv });
} else if (existsSync(expressEnv)) {
  dotenv.config({ path: expressEnv });
}

process.env.AI_API_KEY = process.env.AI_API_KEY?.trim() || 'e2e-mock-ai-key';

// otplib v13 为 ESM，Jest 默认不转译其依赖；e2e 用 mock 即可（MFA 密码学单测另测）
jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'MOCKTOTPSECRET0001'),
  generateURI: jest.fn(
    ({ label }: { label: string }) =>
      `otpauth://totp/FileManagement:${label}?secret=MOCK`,
  ),
  verifySync: jest.fn(() => ({ valid: true })),
}));

// ai / @ai-sdk/openai 为 ESM；e2e 不调用真实大模型
export const MOCK_AI_STREAM_TEXT = 'mock-ai-stream-chunk';

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => ({
    chat: jest.fn(() => 'mock-model'),
  })),
}));

jest.mock('ai', () => ({
  streamText: jest.fn(() => ({
    pipeTextStreamToResponse: (res: {
      status: (code: number) => void;
      setHeader: (name: string, value: string) => void;
      write: (chunk: string) => void;
      end: () => void;
    }) => {
      res.status(200);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.write(MOCK_AI_STREAM_TEXT);
      res.end();
    },
  })),
}));
