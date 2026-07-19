import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type {
  AppendFileAiChatMessageDto,
  FileAiChatModeDto,
} from '@/files/ai/dto/file-ai-chat.dto';
import { FILE_AI_CHAT_MODES } from '@/files/ai/dto/file-ai-chat.dto';

/** 每会话最多保留消息条数（超出删最早） */
export const FILE_AI_CHAT_MAX_MESSAGES = 100;

@Injectable()
export class FilesAiChatSessionService {
  constructor(private readonly prisma: PrismaService) {}

  /** 校验 mode 字面量 */
  parseMode(raw: string): FileAiChatModeDto {
    if ((FILE_AI_CHAT_MODES as readonly string[]).includes(raw)) {
      return raw as FileAiChatModeDto;
    }
    throw new BadRequestException('无效的对话模式');
  }

  /** 懒获取会话（含消息）；文件须本人且未删 */
  async getOrCreateSession(userId: number, fileId: number, modeRaw: string) {
    const mode = this.parseMode(modeRaw);
    await this.requireOwnedFile(userId, fileId);
    const session = await this.ensureSession(userId, fileId, mode);
    const messages = await this.prisma.fileAiChatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        meta: true,
        createdAt: true,
      },
    });
    return {
      success: true as const,
      data: {
        sessionId: session.id,
        mode: session.mode,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          meta: m.meta,
          createdAt: m.createdAt.toISOString(),
        })),
      },
    };
  }

  /** 清空该模式会话下全部消息（保留 session 行） */
  async clearSession(userId: number, fileId: number, modeRaw: string) {
    const mode = this.parseMode(modeRaw);
    await this.requireOwnedFile(userId, fileId);
    const session = await this.prisma.fileAiChatSession.findUnique({
      where: {
        userId_userFileId_mode: { userId, userFileId: fileId, mode },
      },
      select: { id: true },
    });
    if (!session) {
      return { success: true as const, data: { cleared: 0 } };
    }
    const result = await this.prisma.fileAiChatMessage.deleteMany({
      where: { sessionId: session.id },
    });
    await this.prisma.fileAiChatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });
    return { success: true as const, data: { cleared: result.count } };
  }

  /** 追加一条消息；成功后按上限 trim */
  async appendMessage(
    userId: number,
    fileId: number,
    modeRaw: string,
    dto: AppendFileAiChatMessageDto,
  ) {
    const mode = this.parseMode(modeRaw);
    await this.requireOwnedFile(userId, fileId);
    const session = await this.ensureSession(userId, fileId, mode);
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('消息内容不能为空');
    }

    const created = await this.prisma.fileAiChatMessage.create({
      data: {
        sessionId: session.id,
        role: dto.role,
        content,
        meta:
          dto.meta === undefined
            ? undefined
            : (dto.meta as Prisma.InputJsonValue),
      },
      select: {
        id: true,
        role: true,
        content: true,
        meta: true,
        createdAt: true,
      },
    });

    await this.prisma.fileAiChatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });
    await this.trimOldMessages(session.id);

    return {
      success: true as const,
      data: {
        id: created.id,
        role: created.role,
        content: created.content,
        meta: created.meta,
        createdAt: created.createdAt.toISOString(),
      },
    };
  }

  /** 写入一轮 user + assistant（可选 user meta） */
  async appendRound(
    userId: number,
    fileId: number,
    mode: FileAiChatModeDto,
    question: string,
    answer: string,
    userMeta?: Record<string, unknown>,
  ) {
    await this.appendMessage(userId, fileId, mode, {
      role: 'user',
      content: question,
      meta: userMeta,
    });
    return this.appendMessage(userId, fileId, mode, {
      role: 'assistant',
      content: answer,
    });
  }

  private async ensureSession(
    userId: number,
    fileId: number,
    mode: FileAiChatModeDto,
  ) {
    return this.prisma.fileAiChatSession.upsert({
      where: {
        userId_userFileId_mode: { userId, userFileId: fileId, mode },
      },
      create: { userId, userFileId: fileId, mode },
      update: {},
      select: { id: true, mode: true },
    });
  }

  private async trimOldMessages(sessionId: number) {
    const count = await this.prisma.fileAiChatMessage.count({
      where: { sessionId },
    });
    if (count <= FILE_AI_CHAT_MAX_MESSAGES) return;
    const overflow = count - FILE_AI_CHAT_MAX_MESSAGES;
    const oldest = await this.prisma.fileAiChatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: overflow,
      select: { id: true },
    });
    if (oldest.length === 0) return;
    await this.prisma.fileAiChatMessage.deleteMany({
      where: { id: { in: oldest.map((r) => r.id) } },
    });
  }

  private async requireOwnedFile(userId: number, fileId: number) {
    const file = await this.prisma.userFile.findFirst({
      where: { id: fileId, userId, isDeleted: false },
      select: { id: true },
    });
    if (!file) {
      throw new NotFoundException('文件不存在');
    }
  }
}
