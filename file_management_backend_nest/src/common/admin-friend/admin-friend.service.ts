import { Injectable } from '@nestjs/common';
import { FriendshipStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class AdminFriendService {
  constructor(private readonly prisma: PrismaService) {}

  async getPrimaryAdminId(): Promise<number | null> {
    const admin = await this.prisma.user.findFirst({
      where: { role: 'admin' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return admin?.id ?? null;
  }

  async ensureFriendshipWithAdmin(userId: number): Promise<void> {
    const adminId = await this.getPrimaryAdminId();
    if (!adminId || adminId === userId) return;

    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!me || me.role === 'admin') return;

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId: adminId },
          { userId: adminId, friendId: userId },
        ],
      },
    });

    if (existing) {
      if (existing.status !== FriendshipStatus.accepted) {
        await this.prisma.friendship.update({
          where: { id: existing.id },
          data: { status: FriendshipStatus.accepted },
        });
      }
      return;
    }

    await this.prisma.friendship.create({
      data: {
        userId,
        friendId: adminId,
        status: FriendshipStatus.accepted,
      },
    });
  }
}
