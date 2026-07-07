import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { FriendshipStatus, MessageType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { RealtimeEmitterService } from '@/realtime/realtime-emitter.service';
import { loadMessageForEmit } from './message-payload.util';

function asInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = parseInt(value, 10);
    return Number.isInteger(n) ? n : null;
  }
  return null;
}

@Injectable()
export class MessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeEmitterService,
  ) {}

  private async notifyNewMessage(
    receiverId: number,
    messageId: number,
  ): Promise<void> {
    const full = await loadMessageForEmit(this.prisma, messageId);
    if (full) {
      this.realtime.emitToUser(receiverId, 'message:new', { message: full });
    }
  }

  async sendMessage(
    senderId: number,
    body: {
      receiverId?: unknown;
      content?: unknown;
      messageType?: unknown;
      fileId?: unknown;
    },
  ) {
    const receiverId = body.receiverId;
    const content = body.content;
    const messageType =
      (body.messageType as MessageType | undefined) ?? MessageType.text;
    const fileId = body.fileId;

    if (receiverId == null || content == null || content === '') {
      throw new BadRequestException('接收者ID和消息内容不能为空');
    }

    const parsedReceiverId = asInt(receiverId);
    if (parsedReceiverId == null) {
      throw new BadRequestException('接收者ID和消息内容不能为空');
    }

    const textContent = typeof content === 'string' ? content : '';
    if (!textContent) {
      throw new BadRequestException('接收者ID和消息内容不能为空');
    }

    const friendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          {
            userId: senderId,
            friendId: parsedReceiverId,
            status: FriendshipStatus.accepted,
          },
          {
            userId: parsedReceiverId,
            friendId: senderId,
            status: FriendshipStatus.accepted,
          },
        ],
      },
    });

    if (!friendship) {
      throw new ForbiddenException('只有好友之间才能发送消息');
    }

    const message = await this.prisma.message.create({
      data: {
        senderId,
        receiverId: parsedReceiverId,
        content: textContent,
        messageType,
        fileId: asInt(fileId),
      },
    });

    await this.notifyNewMessage(parsedReceiverId, message.id);

    return {
      message: '消息发送成功',
      data: message,
    };
  }

  async getChatHistory(userId: number, friendId: number) {
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
      },
      include: {
        file: {
          select: { id: true, fileName: true, fileType: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return messages;
  }

  async markAsRead(userId: number, friendId: number) {
    const updated = await this.prisma.message.updateMany({
      where: {
        senderId: friendId,
        receiverId: userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      message: '消息已标记为已读',
      updatedCount: updated.count,
    };
  }

  async getUnreadSummary(userId: number) {
    return this.prisma.message.groupBy({
      by: ['senderId'],
      where: {
        receiverId: userId,
        isRead: false,
      },
      _count: {
        id: true,
      },
      _max: {
        createdAt: true,
      },
    });
  }
}
