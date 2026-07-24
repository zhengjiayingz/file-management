import { createOpenAI } from '@ai-sdk/openai';
import { streamText, type StreamTextResult } from 'ai';

/** 用户选中片段最长字符数，防止 token 爆掉 */
const MAX_SELECTED_TEXT_CHARS = 8000;
/** 单条用户问题最长字符数 */
const MAX_QUESTION_CHARS = 2000;
/** 历史消息单条最长字符数 */
const MAX_HISTORY_MESSAGE_CHARS = 4000;
/** 历史消息最多条数（user+assistant 合计） */
const MAX_HISTORY_MESSAGES = 40;
/** 模型单次最多生成 token 数 */
const MAX_OUTPUT_TOKENS = 2048;

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AskAboutSelectionInput = {
  question: string;
  selectedText: string;
  messages?: ChatMessage[];
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
  return deepseek.chat(process.env.AI_MODEL?.trim() || 'deepseek-chat');
}

function clampText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max);
}

function validateMessages(messages: unknown): ChatMessage[] {
  if (messages == null) return [];
  if (!Array.isArray(messages)) {
    throw new Error('对话历史格式无效');
  }
  if (messages.length > MAX_HISTORY_MESSAGES) {
    throw new Error('对话历史过长，请清空后重试');
  }

  const out: ChatMessage[] = [];
  for (const item of messages) {
    if (!item || typeof item !== 'object') {
      throw new Error('对话历史格式无效');
    }
    const { role, content } = item as Record<string, unknown>;
    if (role !== 'user' && role !== 'assistant') {
      throw new Error('对话历史角色无效');
    }
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('对话历史内容不能为空');
    }
    out.push({
      role,
      content: clampText(content, MAX_HISTORY_MESSAGE_CHARS),
    });
  }
  return out;
}

/** 供 controller 调用的参数校验 */
export function validateAskAboutSelectionInput(body: unknown): AskAboutSelectionInput {
  if (!body || typeof body !== 'object') {
    throw new Error('请求体无效');
  }

  const { question, selectedText, fileName, messages } = body as Record<string, unknown>;

  if (typeof question !== 'string' || !question.trim()) {
    throw new Error('问题不能为空');
  }
  if (typeof selectedText !== 'string' || !selectedText.trim()) {
    throw new Error('请先选中要提问的内容');
  }

  return {
    question: clampText(question, MAX_QUESTION_CHARS),
    selectedText: clampText(selectedText, MAX_SELECTED_TEXT_CHARS),
    messages: validateMessages(messages),
    fileName: typeof fileName === 'string' ? fileName.trim().slice(0, 255) : undefined,
  };
}

function buildSystemPrompt(selectedText: string, fileName?: string): string {
  const fileLine = fileName ? `【文件】${fileName}\n` : '';
  return [
    '你是网盘文档阅读助手。',
    '请主要根据下方「选中片段」及对话历史回答问题。',
    '若片段中没有足够信息，请明确说明，不要编造。',
    '用户可能会连续追问，请结合上下文作答。',
    '回答简洁清晰，优先使用中文。',
    '',
    fileLine,
    '【选中内容】',
    selectedText,
  ].join('\n');
}

/**
 * 基于选中文字的多轮流式问答。
 * controller 里用 result.textStream 写入 res。
 */
export function streamAskAboutSelection(
  input: AskAboutSelectionInput,
): StreamTextResult<Record<string, never>, Record<string, unknown>, any> {
  const history = (input.messages ?? []).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  return streamText({
    model: getChatModel(),
    abortSignal: input.abortSignal,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    system: buildSystemPrompt(input.selectedText, input.fileName),
    messages: [
      ...history,
      { role: 'user' as const, content: input.question },
    ],
  });
}
