import { createOpenAI } from '@ai-sdk/openai';
import { streamText, type StreamTextResult } from 'ai';

/** 用户选中片段最长字符数，防止 token 爆掉 */
const MAX_SELECTED_TEXT_CHARS = 8000;
/** 问题最长字符数 */
const MAX_QUESTION_CHARS = 2000;
/** 模型单次最多生成 token 数 */
const MAX_OUTPUT_TOKENS = 2048;

export type AskAboutSelectionInput = {
  question: string;
  selectedText: string;
  fileName?: string;
  abortSignal?: AbortSignal;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function getChatModel() {
  const deepseek = createOpenAI({
    apiKey: requireEnv('AI_API_KEY'),
    baseURL: process.env.AI_BASE_URL?.trim() || 'https://api.deepseek.com',
  });
  // DeepSeek 必须用 .chat()，不能用默认 responses API
  return deepseek.chat(process.env.AI_MODEL?.trim() || 'deepseek-chat');
}

function clampText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max);
}

/** 供 controller 调用的参数校验 */
export function validateAskAboutSelectionInput(body: unknown): AskAboutSelectionInput {
  if (!body || typeof body !== 'object') {
    throw new Error('请求体无效');
  }

  const { question, selectedText, fileName } = body as Record<string, unknown>;

  if (typeof question !== 'string' || !question.trim()) {
    throw new Error('问题不能为空');
  }
  if (typeof selectedText !== 'string' || !selectedText.trim()) {
    throw new Error('请先选中要提问的内容');
  }

  return {
    question: clampText(question, MAX_QUESTION_CHARS),
    selectedText: clampText(selectedText, MAX_SELECTED_TEXT_CHARS),
    fileName: typeof fileName === 'string' ? fileName.trim().slice(0, 255) : undefined,
  };
}

function buildSystemPrompt(): string {
  return [
    '你是网盘文档阅读助手。',
    '请仅根据用户提供的「选中片段」回答问题。',
    '若片段中没有足够信息，请明确说明，不要编造。',
    '回答简洁清晰，优先使用中文。',
  ].join('');
}

function buildUserPrompt(input: AskAboutSelectionInput): string {
  const fileLine = input.fileName ? `【文件】${input.fileName}\n` : '';
  return [
    fileLine,
    '【选中内容】',
    input.selectedText,
    '',
    '【问题】',
    input.question,
  ].join('\n');
}

/**
 * 基于选中文字流式问答。
 * controller 里用 result.textStream 写入 res。
 */
export function streamAskAboutSelection(
  input: AskAboutSelectionInput,
): StreamTextResult<Record<string, never>, Record<string, unknown>, any> {
  return streamText({
    model: getChatModel(),
    abortSignal: input.abortSignal,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(input),
  });
}