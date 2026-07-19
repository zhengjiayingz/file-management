import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { MathTempImagesService } from './math-temp-images.service';
import type { AppendTempChatMessageDto } from '../dto/math-temp.dto';
import { assertTempChatMode } from '../dto/math-temp.dto';
import { FILE_AI_CHAT_MAX_MESSAGES } from '@/files/ai/files-ai-chat-session.service';

@Injectable()
export class MathTempChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tempImages: MathTempImagesService,
  ) {}

  async getOrCreateSession(
    userId: number,
    tempImageId: string,
    modeRaw: string,
  ) {
    let mode: ReturnType<typeof assertTempChatMode>;
    try {
      mode = assertTempChatMode(modeRaw);
    } catch {
      throw new BadRequestException('无效的对话模式');
    }
    await this.tempImages.requireUsable(userId, tempImageId);
    const session = await this.ensureSession(userId, tempImageId, mode);
    const messages = await this.prisma.tempAiChatMessage.findMany({
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

  async clearSession(userId: number, tempImageId: string, modeRaw: string) {
    let mode: ReturnType<typeof assertTempChatMode>;
    try {
      mode = assertTempChatMode(modeRaw);
    } catch {
      throw new BadRequestException('无效的对话模式');
    }
    await this.tempImages.requireUsable(userId, tempImageId);
    const session = await this.prisma.tempAiChatSession.findUnique({
      where: {
        userId_tempImageId_mode: { userId, tempImageId, mode },
      },
      select: { id: true },
    });
    if (!session) {
      return { success: true as const, data: { cleared: 0 } };
    }
    const result = await this.prisma.tempAiChatMessage.deleteMany({
      where: { sessionId: session.id },
    });
    await this.prisma.tempAiChatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });
    return { success: true as const, data: { cleared: result.count } };
  }

  async appendMessage(
    userId: number,
    tempImageId: string,
    modeRaw: string,
    dto: AppendTempChatMessageDto,
  ) {
    let mode: ReturnType<typeof assertTempChatMode>;
    try {
      mode = assertTempChatMode(modeRaw);
    } catch {
      throw new BadRequestException('无效的对话模式');
    }
    await this.tempImages.requireUsable(userId, tempImageId);
    const session = await this.ensureSession(userId, tempImageId, mode);
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('消息内容不能为空');

    const created = await this.prisma.tempAiChatMessage.create({
      data: {
        sessionId: session.id,
        role: dto.role,
        content,
      },
      select: {
        id: true,
        role: true,
        content: true,
        meta: true,
        createdAt: true,
      },
    });
    await this.prisma.tempAiChatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });
    await this.trim(session.id);

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

  private async ensureSession(
    userId: number,
    tempImageId: string,
    mode: 'selection' | 'solve',
  ) {
    return this.prisma.tempAiChatSession.upsert({
      where: {
        userId_tempImageId_mode: { userId, tempImageId, mode },
      },
      create: { userId, tempImageId, mode },
      update: {},
      select: { id: true, mode: true },
    });
  }

  private async trim(sessionId: number) {
    const count = await this.prisma.tempAiChatMessage.count({
      where: { sessionId },
    });
    if (count <= FILE_AI_CHAT_MAX_MESSAGES) return;
    const overflow = count - FILE_AI_CHAT_MAX_MESSAGES;
    const oldest = await this.prisma.tempAiChatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: overflow,
      select: { id: true },
    });
    if (!oldest.length) return;
    await this.prisma.tempAiChatMessage.deleteMany({
      where: { id: { in: oldest.map((r) => r.id) } },
    });
  }
}
