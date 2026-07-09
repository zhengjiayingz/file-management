export const MAX_QUESTION_CHARS = 2000;
export const MAX_HISTORY_MESSAGE_CHARS = 4000;
export const MAX_HISTORY_MESSAGES = 40;
export const MAX_OUTPUT_TOKENS = 2048;

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export function clampText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max);
}

export function validateMessages(messages: unknown): ChatMessage[] {
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
