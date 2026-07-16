import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { KnowledgeBasesAccessHelper } from '../helpers/knowledge-bases-access.helper';
import type { KbCitation } from './knowledge-bases-chat.service';

@Injectable()
export class KnowledgeBasesSessionService {
  /** 注入 Prisma 与知识库归属校验 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KnowledgeBasesAccessHelper,
  ) {}

  /** 列出某知识库下的会话（仅本人库，按更新时间倒序） */
  async listSessions(userId: number, knowledgeBaseId: number) {
    await this.access.requireOwned(userId, knowledgeBaseId);
    return this.prisma.knowledgeBaseSession.findMany({
      where: { knowledgeBaseId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /** 按时间正序列出某会话的全部消息 */
  async listMessages(
    userId: number,
    knowledgeBaseId: number,
    sessionId: number,
  ) {
    await this.requireOwnedSession(userId, knowledgeBaseId, sessionId);
    return this.prisma.knowledgeBaseMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        citations: true,
        createdAt: true,
      },
    });
  }

  /** 删除会话（消息随 Cascade 一并删除） */
  async removeSession(
    userId: number,
    knowledgeBaseId: number,
    sessionId: number,
  ) {
    await this.requireOwnedSession(userId, knowledgeBaseId, sessionId);
    await this.prisma.knowledgeBaseSession.delete({ where: { id: sessionId } });
    return { success: true, message: '已删除' };
  }

  /**
   * 解析 chat 入参中的 sessionId：有则校验归属，无则创建新会话
   * title 可用问题前 30 字
   */
  async resolveSession(
    userId: number,
    knowledgeBaseId: number,
    sessionId: number | undefined,
    question: string,
  ) {
    await this.access.requireOwned(userId, knowledgeBaseId);
    if (sessionId != null) {
      return this.requireOwnedSession(userId, knowledgeBaseId, sessionId);
    }
    const title = question.length > 30 ? question.slice(0, 30) + '…' : question;
    return this.prisma.knowledgeBaseSession.create({
      data: { knowledgeBaseId, title },
    });
  }

  /** 写入一轮 user + assistant 消息，并刷新 session.updatedAt */
  async appendRound(
    sessionId: number,
    question: string,
    answer: string,
    citations: KbCitation[],
  ) {
    await this.prisma.$transaction([
      // 写入 user提问的消息
      this.prisma.knowledgeBaseMessage.create({
        data: { sessionId, role: 'user', content: question },
      }),
      // 写入 assistant 回答的消息
      this.prisma.knowledgeBaseMessage.create({
        data: {
          sessionId,
          role: 'assistant',
          content: answer,
          citations: citations,
        },
      }),
      // 更新 session.updatedAt，每次提问后该对话的刷新时间就更新成现在的时间。
      this.prisma.knowledgeBaseSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      }),
    ]);
  }

  /** 校验会话属于该知识库且库属于当前用户 */
  private async requireOwnedSession(
    userId: number,
    knowledgeBaseId: number,
    sessionId: number,
  ) {
    await this.access.requireOwned(userId, knowledgeBaseId);
    const session = await this.prisma.knowledgeBaseSession.findFirst({
      where: { id: sessionId, knowledgeBaseId },
    });
    if (!session) throw new NotFoundException('会话不存在');
    return session;
  }
}
