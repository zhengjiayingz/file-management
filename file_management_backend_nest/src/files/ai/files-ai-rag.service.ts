import { Injectable } from '@nestjs/common';
import { streamText } from 'ai';
import type { Request, Response } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { embedOne } from '@/files/ai/embedding/embedding.provider';
import {
  topKByEmbedding,
  type EmbeddingItem,
} from '@/files/ai/embedding/similarity.util';
import { getChatModel } from '@/files/ai/utils/chat-model.provider';
import {
  clampText,
  MAX_OUTPUT_TOKENS,
  MAX_QUESTION_CHARS,
  validateMessages,
  type ChatMessage,
} from '@/files/ai/utils/chat-message.util';

const RAG_TOP_K = 6;

export type RagAskInput = {
  question: string;
  messages?: ChatMessage[];
  abortSignal?: AbortSignal;
};

type RagChunk = {
  id: number;
  chunkIndex: number;
  content: string;
};

export function validateRagAskInput(body: unknown): RagAskInput {
  if (!body || typeof body !== 'object') {
    throw new Error('请求体无效');
  }

  const { question, messages } = body as Record<string, unknown>;

  if (typeof question !== 'string' || !question.trim()) {
    throw new Error('问题不能为空');
  }

  return {
    question: clampText(question, MAX_QUESTION_CHARS),
    messages: validateMessages(messages),
  };
}

function asEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  if (!value.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return null;
  }
  return value as number[];
}

function buildRagSystemPrompt(chunks: RagChunk[], fileName?: string): string {
  const fileLine = fileName ? `【文件】${fileName}\n` : '';
  const chunkBlocks = chunks.map((chunk) => chunk.content).join('\n\n---\n\n');

  return [
    '你是网盘文档阅读助手。',
    '请仅根据下方「检索片段」及对话历史回答问题。',
    '若检索片段中没有足够信息，请明确说明不知道，不要编造。',
    '用户可能会连续追问，请结合上下文作答。',
    '回答时直接陈述内容，不要在回答中出现「片段 N」「参考材料」等内部标记或编号。',
    '回答简洁清晰，优先使用中文。',
    '',
    fileLine,
    '【检索片段】',
    chunkBlocks || '（无可用片段）',
  ].join('\n');
}

function isClientErrorMessage(message: string): boolean {
  return (
    message.includes('不能为空') ||
    message.includes('请求体') ||
    message.includes('对话历史')
  );
}

@Injectable()
export class FilesAiRagService {
  constructor(private readonly prisma: PrismaService) {}

  private streamRagAsk(
    input: RagAskInput,
    chunks: RagChunk[],
    fileName: string,
  ) {
    const history = (input.messages ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    return streamText({
      model: getChatModel(),
      abortSignal: input.abortSignal,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      system: buildRagSystemPrompt(chunks, fileName),
      messages: [
        ...history,
        { role: 'user' as const, content: input.question },
      ],
    });
  }

  async ragAsk(
    req: Request,
    res: Response,
    userId: number,
    fileId: number,
    body: unknown,
  ): Promise<void> {
    try {
      const input = validateRagAskInput(body);

      const userFile = await this.prisma.userFile.findFirst({
        where: { id: fileId, userId, isDeleted: false },
        select: { fileName: true },
      });
      if (!userFile) {
        res.status(404).json({ success: false, message: '文件不存在' });
        return;
      }

      const indexJob = await this.prisma.documentIndexJob.findUnique({
        where: { userFileId: fileId },
        select: { status: true },
      });
      if (!indexJob || indexJob.status !== 'ready') {
        res.status(409).json({ success: false, message: '请先建立索引' });
        return;
      }

      const rows = await this.prisma.documentChunk.findMany({
        where: { userFileId: fileId },
        select: {
          id: true,
          chunkIndex: true,
          content: true,
          embedding: true,
        },
        orderBy: { chunkIndex: 'asc' },
      });

      const embeddingItems: EmbeddingItem[] = [];
      const chunkById = new Map<number, RagChunk>();

      for (const row of rows) {
        const embedding = asEmbedding(row.embedding);
        if (!embedding) continue;

        embeddingItems.push({ id: row.id, embedding });
        chunkById.set(row.id, {
          id: row.id,
          chunkIndex: row.chunkIndex,
          content: row.content,
        });
      }

      if (embeddingItems.length === 0) {
        res.status(409).json({ success: false, message: '请先建立索引' });
        return;
      }

      const questionEmbedding = await embedOne(input.question);
      const topIds = topKByEmbedding(
        questionEmbedding,
        embeddingItems,
        RAG_TOP_K,
      );

      const selectedChunks = topIds
        .map((id) => chunkById.get(id))
        .filter((chunk): chunk is RagChunk => chunk != null);

      const abortController = new AbortController();
      req.on('close', () => {
        if (!res.writableEnded) {
          abortController.abort();
        }
      });

      const result = this.streamRagAsk(
        {
          ...input,
          abortSignal: abortController.signal,
        },
        selectedChunks,
        userFile.fileName,
      );

      result.pipeTextStreamToResponse(res);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'RAG 问答失败';
      if (res.headersSent) {
        console.error('[AI rag-ask] Stream error:', error);
        return;
      }
      const status = isClientErrorMessage(message) ? 400 : 500;
      res.status(status).json({ success: false, message });
    }
  }
}
