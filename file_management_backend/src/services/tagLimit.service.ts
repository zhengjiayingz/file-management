import type { Role } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { getSystemSettings } from './systemSettings.service.js';

/** 有效 VIP：角色为 vip 且未过期 */
export function isEffectiveVip(role: Role, vipExpireAt: Date | null): boolean {
  if (role !== 'vip') return false;
  if (!vipExpireAt) return true;
  return vipExpireAt > new Date();
}

/** 管理员不限制标签数量 */
export async function getMaxTagsForUser(userId: number): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, vipExpireAt: true }
  });
  if (!user) return 0;
  if (user.role === 'admin') return Number.MAX_SAFE_INTEGER; // 无上限

  const settings = await getSystemSettings();
  if (isEffectiveVip(user.role, user.vipExpireAt)) {
    return Math.max(0, settings.maxTagsVip);
  }
  return Math.max(0, settings.maxTagsUser);
}
