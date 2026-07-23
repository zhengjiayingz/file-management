import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { streamText } from 'ai';
import type { Request, Response } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { embedOne } from '@/files/ai/index/provider/embedding.provider';
import {
  topKByEmbedding,
  type EmbeddingItem,
} from '@/files/ai/index/utils/similarity.util';
import { getChatModel } from '@/files/ai/chat/provider/chat-model.provider';
import {
  clampText,
  MAX_HISTORY_MESSAGE_CHARS,
  MAX_HISTORY_MESSAGES,
  MAX_OUTPUT_TOKENS,
  MAX_QUESTION_CHARS,
  type ChatMessage,
} from '@/files/ai/chat/utils/chat-message.util';
import { KnowledgeBasesService } from './knowledge-bases.service';
import { KnowledgeBasesSessionService } from './knowledge-bases-session.service';

const RAG_TOP_K = 6;
const EXCERPT_MAX = 160;

export type KbCitation = {
  fileId: number;
  fileName: string;
  chunkIndex: number;
  excerpt: string;
};

type KbChunk = {
  id: number;
  userFileId: number;
  fileName: string;
  chunkIndex: number;
  content: string;
};

@Injectable()
export class KnowledgeBasesChatService {
  /** 注入 Prisma、知识库校验与会话落库 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBases: KnowledgeBasesService,
    private readonly sessions: KnowledgeBasesSessionService,
  ) {}

  /**
   * 流式问答：校验可问 → 会话 → 检索 → 响应头带 sessionId/citations → 文本流 → 结束后落库
   */
  async chat(
    req: Request,
    res: Response,
    userId: number,
    knowledgeBaseId: number,
    body: unknown,
  ): Promise<void> {
    try {
      const question = this.parseQuestion(body);
      const sessionIdOpt = this.parseOptionalSessionId(body);
      // 空库 / 未全员 ready 时直接 4xx，必须在开流之前
      await this.knowledgeBases.assertReadyForChat(userId, knowledgeBaseId);

      // 有 sessionId 则校验归属；无则懒创建会话（title 取自问题前缀）
      const session = await this.sessions.resolveSession(
        userId,
        knowledgeBaseId,
        sessionIdOpt,
        question,
      );

      const items = await this.prisma.knowledgeBaseItem.findMany({
        where: { knowledgeBaseId },
        select: {
          userFileId: true,
          userFile: { select: { id: true, fileName: true } },
        },
      });
      const fileIds = items.map((i) => i.userFileId);
      // 构造 userFileId → fileName，citations / prompt 会用到
      const nameByFileId = new Map(
        items.map((i) => [i.userFileId, i.userFile.fileName] as const),
      );

      // 在多个文件的 DocumentChunk 中按向量相似度取 Top-K
      const selected = await this.retrieveTopChunks(
        fileIds,
        nameByFileId,
        question,
      );
      // citations 只含约 160 字预览，用户点进原文靠 fileId + chunkIndex
      const citations = this.buildCitations(selected);
      // 读取已落库历史（不含本轮尚未写入的 question）
      const history = await this.loadHistoryMessages(session.id);

      // 方案 A：元数据走响应头，正文只管文本流（前端需读 expose 的自定义头）
      res.setHeader('X-Session-Id', String(session.id));
      res.setHeader(
        'Access-Control-Expose-Headers',
        'X-Session-Id, X-Citations',
      );
      res.setHeader(
        'X-Citations',
        Buffer.from(JSON.stringify(citations), 'utf8').toString('base64url'),
      );

      // 客户端断开时 abort，避免继续烧 token
      const abortController = new AbortController();
      req.on('close', () => {
        if (!res.writableEnded) {
          abortController.abort();
        }
      });

      // history + 本轮 question；检索片段放在 system
      const result = streamText({
        model: getChatModel(),
        abortSignal: abortController.signal,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        system: this.buildSystemPrompt(selected),
        // 把历史消息 + 本轮 question 发送给LLM模型
        messages: [
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user' as const, content: question },
        ],
      });

      result.pipeTextStreamToResponse(res);

      // 等流结束拿到全文再落库（客户端中途断开时可能为空，则跳过）
      const answer = (await result.text)?.trim() || '';
      if (answer) {
        // 写入一轮 user + assistant，并刷新 session.updatedAt
        await this.sessions.appendRound(
          session.id,
          question,
          answer,
          citations,
        );
      }
    } catch (error) {
      // 已经开始推流就只能打日志，不能再改成 JSON
      if (res.headersSent) {
        console.error('[KB chat] stream error:', error);
        return;
      }
      const status = error instanceof HttpException ? error.getStatus() : 500;
      const message = error instanceof Error ? error.message : '知识库问答失败';
      res.status(status).json({ success: false, message });
    }
  }

  /** 解析 body 中可选的 sessionId（未传则 undefined，由 resolveSession 懒创建） */
  private parseOptionalSessionId(body: unknown): number | undefined {
    if (!body || typeof body !== 'object') return undefined;
    const raw = (body as { sessionId?: unknown }).sessionId;
    if (raw == null || raw === '') return undefined;
    const n =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string' && /^\d+$/.test(raw.trim())
          ? parseInt(raw.trim(), 10)
          : NaN;
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('sessionId 无效');
    }
    return n;
  }

  /** 解析并截断用户问题 */
  private parseQuestion(body: unknown): string {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('请求体无效');
    }
    const q = (body as { question?: unknown }).question;
    if (typeof q !== 'string' || !q.trim()) {
      throw new BadRequestException('问题不能为空');
    }
    return clampText(q.trim(), MAX_QUESTION_CHARS);
  }

  /**
   * 在多个 userFileId 的 DocumentChunk 中按向量相似度取 Top-K
   */
  private async retrieveTopChunks(
    fileIds: number[],
    nameByFileId: Map<number, string>,
    question: string,
  ): Promise<KbChunk[]> {
    const rows = await this.prisma.documentChunk.findMany({
      where: { userFileId: { in: fileIds } },
      select: {
        id: true,
        userFileId: true,
        chunkIndex: true,
        content: true,
        embedding: true,
      },
      orderBy: [{ userFileId: 'asc' }, { chunkIndex: 'asc' }],
    });

    const embeddingItems: EmbeddingItem[] = [];
    const chunkById = new Map<number, KbChunk>();

    for (const row of rows) {
      const embedding = this.asEmbedding(row.embedding);
      if (!embedding) continue;
      embeddingItems.push({ id: row.id, embedding });
      // chunkId → chunk 映射，Top-K 取 id 后再回填正文
      chunkById.set(row.id, {
        id: row.id,
        userFileId: row.userFileId,
        fileName: nameByFileId.get(row.userFileId) ?? `file-${row.userFileId}`,
        chunkIndex: row.chunkIndex,
        content: row.content,
      });
    }

    if (embeddingItems.length === 0) {
      throw new BadRequestException(
        '知识库内暂无可用向量，请确认文件已完成索引',
      );
    }

    const questionEmbedding = await embedOne(question);
    // 按与 query 的 cosine 相似度降序，返回 Top-K 的 id 列表
    const topIds = topKByEmbedding(
      questionEmbedding,
      embeddingItems,
      RAG_TOP_K,
    );

    return topIds
      .map((id) => chunkById.get(id))
      .filter((c): c is KbChunk => c != null);
  }

  /** 把命中片段收成 citations（excerpt 截断） */
  // 截取 160 字只是预览，用户点击可进原文，这里够用
  private buildCitations(chunks: KbChunk[]): KbCitation[] {
    return chunks.map((c) => ({
      fileId: c.userFileId,
      fileName: c.fileName,
      chunkIndex: c.chunkIndex,
      excerpt:
        c.content.length > EXCERPT_MAX
          ? c.content.slice(0, EXCERPT_MAX) + '…'
          : c.content,
    }));
  }

  /** 组装多文件 RAG 的 system prompt（片段标明文件名） */
  private buildSystemPrompt(chunks: KbChunk[]): string {
    const blocks = chunks
      .map(
        (c) => `【文件：${c.fileName} / chunk ${c.chunkIndex}】\n${c.content}`,
      )
      .join('\n\n---\n\n');

    return [
      '你是个人知识库助手，需要综合多份文档回答。',
      '请仅根据下方「检索片段」及对话历史回答；信息不足时明确说不知道，不要编造。',
      '回答中不要出现「片段 N」「参考材料」等内部标记。',
      '回答简洁清晰，优先使用中文。',
      '',
      '【检索片段】',
      blocks || '（无可用片段）',
    ].join('\n');
  }

  /** 校验 embedding JSON 是否为可用 number[] */
  private asEmbedding(value: unknown): number[] | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    if (!value.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return null;
    }
    return value as number[];
  }

  /**
   * 读取会话中已落库的历史，转成 LLM messages（不含本轮未写入的 question）
   * 超过 MAX_HISTORY_MESSAGES 时只取最近若干条
   */
  private async loadHistoryMessages(sessionId: number): Promise<ChatMessage[]> {
    const rows = await this.prisma.knowledgeBaseMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
    // 超过 MAX_HISTORY_MESSAGES 时只取最近若干(40)条
    const sliced =
      rows.length > MAX_HISTORY_MESSAGES
        ? rows.slice(rows.length - MAX_HISTORY_MESSAGES)
        : rows;

    return sliced.map((row) => ({
      role: row.role,
      content: clampText(row.content, MAX_HISTORY_MESSAGE_CHARS),
    }));
  }
}
