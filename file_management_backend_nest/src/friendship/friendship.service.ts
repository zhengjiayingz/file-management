import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FriendshipStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

function asOptionalInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = parseInt(value, 10);
    return Number.isInteger(n) ? n : null;
  }
  return null;
}

@Injectable()
export class FriendshipService {
  constructor(private readonly prisma: PrismaService) {}

  /** S9 补 Socket 推送 */
  private emitFriendshipSync(): void {
    // no-op in S8
  }

  async sendFriendRequest(
    userId: number,
    body: { friendUsername?: unknown; friendId?: unknown },
  ) {
    const { friendUsername, friendId } = body;

    if (!friendUsername && !friendId) {
      throw new BadRequestException('请输入好友用户名或ID');
    }

    let friend = null;
    const parsedFriendId = asOptionalInt(friendId);
    if (parsedFriendId != null) {
      friend = await this.prisma.user.findUnique({
        where: { id: parsedFriendId },
      });
    } else if (typeof friendUsername === 'string' && friendUsername.trim()) {
      friend = await this.prisma.user.findUnique({
        where: { username: friendUsername.trim() },
      });
    }

    if (!friend) {
      throw new NotFoundException('用户不存在');
    }

    if (friend.id === userId) {
      throw new BadRequestException('不能添加自己为好友');
    }

    const existingFriendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId: friend.id },
          { userId: friend.id, friendId: userId },
        ],
      },
    });

    if (existingFriendship) {
      if (existingFriendship.status === FriendshipStatus.pending) {
        throw new BadRequestException('已发送好友请求，请等待对方处理');
      }
      if (existingFriendship.status === FriendshipStatus.accepted) {
        throw new BadRequestException('你们已经是好友了');
      }
      if (existingFriendship.status === FriendshipStatus.blocked) {
        throw new BadRequestException('无法添加好友');
      }
    }

    const friendship = await this.prisma.friendship.create({
      data: {
        userId,
        friendId: friend.id,
        status: FriendshipStatus.pending,
      },
    });

    this.emitFriendshipSync();

    return {
      message: '好友请求发送成功',
      friendship,
    };
  }

  async acceptFriendRequest(userId: number, requestId: number) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: requestId },
    });

    if (!friendship) {
      throw new NotFoundException('请求不存在');
    }

    if (friendship.friendId !== userId) {
      throw new ForbiddenException('无权操作此请求');
    }

    if (friendship.status !== FriendshipStatus.pending) {
      throw new BadRequestException('该请求已处理');
    }

    const updatedFriendship = await this.prisma.friendship.update({
      where: { id: friendship.id },
      data: { status: FriendshipStatus.accepted },
    });

    this.emitFriendshipSync();

    return {
      message: '已接受好友申请',
      friendship: updatedFriendship,
    };
  }

  async rejectFriendRequest(userId: number, requestId: number) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: requestId },
    });

    if (!friendship) {
      throw new NotFoundException('请求不存在');
    }

    if (friendship.friendId !== userId) {
      throw new ForbiddenException('无权操作此请求');
    }

    if (friendship.status !== FriendshipStatus.pending) {
      throw new BadRequestException('该请求已处理');
    }

    const updatedFriendship = await this.prisma.friendship.update({
      where: { id: friendship.id },
      data: { status: FriendshipStatus.rejected },
    });

    this.emitFriendshipSync();

    return {
      message: '已拒绝好友申请',
      friendship: updatedFriendship,
    };
  }

  async getFriendsList(userId: number) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { userId, status: FriendshipStatus.accepted },
          { friendId: userId, status: FriendshipStatus.accepted },
        ],
      },
      include: {
        user: {
          select: { id: true, username: true, email: true },
        },
        friend: {
          select: { id: true, username: true, email: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const friendMap = new Map<
      number,
      {
        friendshipId: number;
        friendId: number;
        username: string;
        email: string | null;
        createdAt: Date;
        updatedAt: Date;
      }
    >();

    friendships.forEach((f) => {
      const isSender = f.userId === userId;
      const friendInfo = isSender ? f.friend : f.user;

      if (!friendMap.has(friendInfo.id)) {
        friendMap.set(friendInfo.id, {
          friendshipId: f.id,
          friendId: friendInfo.id,
          username: friendInfo.username,
          email: friendInfo.email,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
        });
      }
    });

    return Array.from(friendMap.values());
  }

  async getPendingRequests(userId: number) {
    const requests = await this.prisma.friendship.findMany({
      where: {
        friendId: userId,
        status: FriendshipStatus.pending,
      },
      include: {
        user: {
          select: { id: true, username: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return requests.map((r) => ({
      requestId: r.id,
      senderId: r.user.id,
      senderUsername: r.user.username,
      createdAt: r.createdAt,
    }));
  }

  async removeFriend(userId: number, friendId: number) {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId, status: FriendshipStatus.accepted },
          {
            userId: friendId,
            friendId: userId,
            status: FriendshipStatus.accepted,
          },
        ],
      },
    });

    if (!friendship) {
      throw new NotFoundException('好友关系不存在');
    }

    await this.prisma.friendship.delete({
      where: { id: friendship.id },
    });

    this.emitFriendshipSync();

    return { message: '已删除好友' };
  }
}
