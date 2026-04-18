import { FriendshipStatus } from '@prisma/client';
import prisma from '../lib/prisma.js';

/** 取一个管理员账号（多管理员时取 id 最小） */
export async function getPrimaryAdminId(): Promise<number | null> {
  const admin = await prisma.user.findFirst({
    where: { role: 'admin' },
    select: { id: true },
    orderBy: { id: 'asc' }
  });
  return admin?.id ?? null;
}

/**
 * 确保普通用户与管理员为已接受的好友关系（单向一条 userId→friendId 即可被双方列表识别）
 */
export async function ensureFriendshipWithAdmin(userId: number): Promise<void> {
  const adminId = await getPrimaryAdminId();
  if (!adminId || adminId === userId) return;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });
  if (!me || me.role === 'admin') return;

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userId, friendId: adminId },
        { userId: adminId, friendId: userId }
      ]
    }
  });

  if (existing) {
    if (existing.status !== FriendshipStatus.accepted) {
      await prisma.friendship.update({
        where: { id: existing.id },
        data: { status: FriendshipStatus.accepted }
      });
    }
    return;
  }

  await prisma.friendship.create({
    data: {
      userId,
      friendId: adminId,
      status: FriendshipStatus.accepted
    }
  });
}
