import { Injectable } from '@nestjs/common';
import { streamText } from 'ai';
import type { Request, Response } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { getChatModel } from '@/files/ai/utils/chat-model.provider';
import {
  clampText,
  MAX_OUTPUT_TOKENS,
  MAX_QUESTION_CHARS,
  validateMessages,
  type ChatMessage,
} from '@/files/ai/utils/chat-message.util';

const MAX_SELECTED_TEXT_CHARS = 8000;

export type { ChatMessage };

export type AskAboutSelectionInput = {
  question: string;
  selectedText: string;
  messages?: ChatMessage[];
  fileName?: string;
  abortSignal?: AbortSignal;
};

export function validateAskAboutSelectionInput(
  body: unknown,
): AskAboutSelectionInput {
  if (!body || typeof body !== 'object') {
    throw new Error('请求体无效');
  }

  const { question, selectedText, fileName, messages } = body as Record<
    string,
    unknown
  >;

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
    fileName:
      typeof fileName === 'string' ? fileName.trim().slice(0, 255) : undefined,
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

function isClientErrorMessage(message: string): boolean {
  return (
    message.includes('不能为空') ||
    message.includes('选中') ||
    message.includes('请求体') ||
    message.includes('对话历史')
  );
}

@Injectable()
export class FilesAiService {
  constructor(private readonly prisma: PrismaService) {}

  private streamAskAboutSelection(input: AskAboutSelectionInput) {
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

  async askAboutSelection(
    req: Request,
    res: Response,
    userId: number,
    fileId: number,
    body: unknown,
  ): Promise<void> {
    try {
      const input = validateAskAboutSelectionInput(body);

      const userFile = await this.prisma.userFile.findFirst({
        where: { id: fileId, userId, isDeleted: false },
        select: { fileName: true },
      });
      if (!userFile) {
        res.status(404).json({ success: false, message: '文件不存在' });
        return;
      }

      const abortController = new AbortController();
      req.on('close', () => {
        if (!res.writableEnded) {
          abortController.abort();
        }
      });

      const result = this.streamAskAboutSelection({
        ...input,
        fileName: input.fileName ?? userFile.fileName,
        abortSignal: abortController.signal,
      });

      result.pipeTextStreamToResponse(res);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 问答失败';
      if (res.headersSent) {
        console.error('[AI ask] Stream error:', error);
        return;
      }
      const status = isClientErrorMessage(message) ? 400 : 500;
      res.status(status).json({ success: false, message });
    }
  }
}
