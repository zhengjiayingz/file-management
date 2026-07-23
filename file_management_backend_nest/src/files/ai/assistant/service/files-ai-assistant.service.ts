import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { generateText, stepCountIs, streamText, tool } from 'ai';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { PrismaService } from '@/prisma/prisma.service';
import { FilesQueryService } from '@/files/query/files-query.service';
import { FilesAiIndexService } from '@/files/ai/index/service/files-ai-index.service';
import { embedOne } from '@/files/ai/index/provider/embedding.provider';
import {
  topKByEmbedding,
  type EmbeddingItem,
} from '@/files/ai/index/utils/similarity.util';
import { getChatModel } from '@/files/ai/chat/provider/chat-model.provider';
import {
  clampText,
  MAX_OUTPUT_TOKENS,
  MAX_QUESTION_CHARS,
  validateMessages,
  type ChatMessage,
} from '@/files/ai/chat/utils/chat-message.util';

const RAG_TOP_K = 6;
const LIST_LIMIT = 40;
const EXTRACT_MAX_CHARS = 8000;

type AssistantChatInput = {
  message: string;
  messages?: ChatMessage[];
  /** 当前浏览目录；不传则 list_files 默认根目录 */
  parentId?: number | null;
  abortSignal?: AbortSignal;
};

function asEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return null;
  }
  return value as number[];
}

function validateAssistantBody(body: unknown): AssistantChatInput {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('请求体无效');
  }
  const { message, messages, parentId } = body as Record<string, unknown>;
  if (typeof message !== 'string' || !message.trim()) {
    throw new BadRequestException('消息不能为空');
  }
  let parent: number | null | undefined;
  if (parentId === null || parentId === undefined) {
    parent = parentId === null ? null : undefined;
  } else if (typeof parentId === 'number' && Number.isFinite(parentId)) {
    parent = Math.floor(parentId);
  } else if (typeof parentId === 'string' && parentId.trim() !== '') {
    const n = Number.parseInt(parentId, 10);
    if (!Number.isFinite(n)) throw new BadRequestException('parentId 无效');
    parent = n;
  } else {
    throw new BadRequestException('parentId 无效');
  }
  return {
    message: clampText(message, MAX_QUESTION_CHARS),
    messages: validateMessages(messages),
    parentId: parent,
  };
}

@Injectable()
export class FilesAiAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly filesQueryService: FilesQueryService,
    private readonly filesAiIndexService: FilesAiIndexService,
  ) {}

  private buildTools(userId: number, defaultParentId?: number | null) {
    return {
      list_files: tool({
        description:
          '列出当前用户网盘中某目录下的文件/文件夹。不传 parentId 时使用会话默认目录（通常是根目录）。可用 keyword 按文件名模糊筛选。',
        inputSchema: z.object({
          parentId: z
            .number()
            .int()
            .nullable()
            .optional()
            .describe('父文件夹 id；null 表示根目录'),
          keyword: z.string().optional().describe('可选，按文件名包含匹配'),
        }),
        execute: async ({ parentId, keyword }) => {
          const pid =
            parentId === undefined ? (defaultParentId ?? null) : parentId;
          const result = await this.filesQueryService.getFiles(userId, {
            parentId: pid == null ? '' : String(pid),
            ...(keyword?.trim() ? { q: keyword.trim() } : {}),
          });
          const files = (result.data ?? []).slice(0, LIST_LIMIT).map((f) => ({
            id: f.id,
            fileName: f.fileName,
            fileType: f.fileType,
            mimeType: f.mimeType,
            fileSize: f.fileSize,
            parentId: f.parentId,
          }));
          return {
            parentId: pid,
            total: result.total,
            shown: files.length,
            files,
          };
        },
      }),

      get_extracted_text: tool({
        description:
          '读取已建立索引的文件正文（OCR/文档提取/音频转写拼接）。未索引会报错。长文会截断。',
        inputSchema: z.object({
          fileId: z.number().int().positive().describe('用户文件 id'),
        }),
        execute: async ({ fileId }) => {
          try {
            const res = await this.filesAiIndexService.getExtractedText(
              userId,
              fileId,
            );
            const text = res.data.text ?? '';
            const truncated = text.length > EXTRACT_MAX_CHARS;
            return {
              fileId,
              chunkCount: res.data.chunkCount,
              truncated,
              text: truncated
                ? `${text.slice(0, EXTRACT_MAX_CHARS)}\n…(已截断)`
                : text,
            };
          } catch (e) {
            const msg =
              e instanceof NotFoundException || e instanceof BadRequestException
                ? e.message
                : e instanceof Error
                  ? e.message
                  : '读取失败';
            return { fileId, error: msg };
          }
        },
      }),

      rag_ask: tool({
        description:
          '基于已索引文件做检索增强问答，返回一段完整回答（非流式）。适合「这个文档讲了什么」类问题。',
        inputSchema: z.object({
          fileId: z.number().int().positive().describe('用户文件 id'),
          question: z.string().min(1).describe('要问的问题'),
        }),
        execute: async ({ fileId, question }) => {
          try {
            const answer = await this.ragAskOnce(
              userId,
              fileId,
              clampText(question, MAX_QUESTION_CHARS),
            );
            return { fileId, answer };
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'RAG 失败';
            return { fileId, error: msg };
          }
        },
      }),
    };
  }

  /** 单次 RAG：检索 Top-K + generateText，供 tool 使用 */
  private async ragAskOnce(
    userId: number,
    fileId: number,
    question: string,
  ): Promise<string> {
    const userFile = await this.prisma.userFile.findFirst({
      where: { id: fileId, userId, isDeleted: false },
      select: { fileName: true },
    });
    if (!userFile) throw new Error('文件不存在');

    const indexJob = await this.prisma.documentIndexJob.findUnique({
      where: { userFileId: fileId },
      select: { status: true },
    });
    if (!indexJob || indexJob.status !== 'ready') {
      throw new Error('请先建立索引');
    }

    const rows = await this.prisma.documentChunk.findMany({
      where: { userFileId: fileId },
      select: {
        id: true,
        content: true,
        embedding: true,
      },
      orderBy: { chunkIndex: 'asc' },
    });

    const embeddingItems: EmbeddingItem[] = [];
    const contentById = new Map<number, string>();
    for (const row of rows) {
      const embedding = asEmbedding(row.embedding);
      if (!embedding) continue;
      embeddingItems.push({ id: row.id, embedding });
      contentById.set(row.id, row.content);
    }
    if (embeddingItems.length === 0) throw new Error('请先建立索引');

    const questionEmbedding = await embedOne(question);
    const topIds = topKByEmbedding(
      questionEmbedding,
      embeddingItems,
      RAG_TOP_K,
    );
    const chunks = topIds
      .map((id) => contentById.get(id))
      .filter((c): c is string => Boolean(c));

    const system = [
      '你是网盘文档阅读助手。仅根据检索片段回答，没有信息就说不知道。',
      '回答简洁，优先中文，不要出现「片段 N」等内部标记。',
      `【文件】${userFile.fileName}`,
      '【检索片段】',
      chunks.join('\n\n---\n\n') || '（无）',
    ].join('\n');

    const { text } = await generateText({
      model: getChatModel(),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      system,
      prompt: question,
    });
    return text.trim() || '（模型未返回内容）';
  }

  async chat(
    req: Request,
    res: Response,
    userId: number,
    body: unknown,
  ): Promise<void> {
    try {
      const input = validateAssistantBody(body);
      const abortController = new AbortController();
      req.on('close', () => {
        if (!res.writableEnded) abortController.abort();
      });

      const history = (input.messages ?? []).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const result = streamText({
        model: getChatModel(),
        abortSignal: abortController.signal,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        stopWhen: stepCountIs(6),
        system: [
          '你是网盘 AI 助手，可以通过工具查询用户自己的文件并回答问题。',
          '只使用工具返回的信息，不要编造文件名或内容。',
          '需要看目录时用 list_files；需要读正文用 get_extracted_text；针对某已索引文件深入提问用 rag_ask。',
          '工具报错时向用户解释下一步（例如先建立索引）。',
          '回答简洁，优先中文。',
        ].join('\n'),
        messages: [
          ...history,
          { role: 'user' as const, content: input.message },
        ],
        tools: this.buildTools(userId, input.parentId),
      });

      result.pipeTextStreamToResponse(res);
      // 等流结束再返回，避免 async 无 await，也让 Nest 在流完成前保持请求上下文
      await result.text;
    } catch (error) {
      const message = error instanceof Error ? error.message : '助手对话失败';
      if (res.headersSent) {
        console.error('[AI assistant] Stream error:', error);
        return;
      }
      const status =
        error instanceof BadRequestException
          ? 400
          : message.includes('不能为空') || message.includes('无效')
            ? 400
            : 500;
      res.status(status).json({ success: false, message });
    }
  }
}
