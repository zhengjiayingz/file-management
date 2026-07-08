import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ADMIN_TEMP_RESET_PASSWORD,
  PASSWORD_CATEGORY_ORDER,
  PasswordPolicyService,
  type PasswordCategoryKey,
} from '@/common/password-policy/password-policy.service';
import { AdminFriendService } from '@/common/admin-friend/admin-friend.service';
import { PrismaService } from '@/prisma/prisma.service';

const defaultPasswordCategories: PasswordCategoryKey[] = [
  'digit',
  'lower',
  'upper',
  'special',
];

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function parsePositiveBigInt(
  v: string | number | undefined | null,
  fallback: bigint,
): bigint {
  if (v === undefined || v === null) return fallback;
  try {
    const s = typeof v === 'string' ? v.trim() : String(v);
    const n = BigInt(s);
    if (n <= BigInt(0)) return fallback;
    return n;
  } catch {
    return fallback;
  }
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly adminFriend: AdminFriendService,
  ) {}

  async getDashboardStats() {
    try {
      const totalUsers = await this.prisma.user.count();
      const activeUsers = await this.prisma.user.count({
        where: { status: 'active' },
      });
      const userRoles = await this.prisma.user.groupBy({
        by: ['role'],
        _count: { id: true },
      });
      const roleDistribution = userRoles.reduce(
        (acc, curr) => {
          acc[curr.role] = curr._count.id;
          return acc;
        },
        {} as Record<string, number>,
      );

      const totalStorageQuery = await this.prisma.fileStorage.aggregate({
        _sum: { fileSize: true },
      });
      const totalStorageUsed =
        totalStorageQuery._sum.fileSize?.toString() || '0';

      const storageRanking = await this.prisma.user.findMany({
        orderBy: { storageUsed: 'desc' },
        take: 5,
        select: { id: true, username: true, storageUsed: true },
      });
      const formattedStorageRanking = storageRanking.map((u) => ({
        ...u,
        storageUsed: u.storageUsed.toString(),
      }));

      const totalFiles = await this.prisma.userFile.count({
        where: { isDeleted: false, fileType: 'file' },
      });
      const fileTypeDistribution = await this.prisma.fileStorage.groupBy({
        by: ['mimeType'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      });

      const recentOperations = await this.prisma.operationLog.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { username: true } } },
      });

      return {
        success: true,
        data: {
          users: {
            total: totalUsers,
            active: activeUsers,
            roles: roleDistribution,
          },
          storage: {
            totalUsed: totalStorageUsed,
            ranking: formattedStorageRanking,
          },
          files: {
            total: totalFiles,
            types: fileTypeDistribution,
          },
          logs: { recent: recentOperations },
        },
      };
    } catch {
      throw new InternalServerErrorException('获取仪表盘数据失败');
    }
  }

  async syncFriendshipsWithAdmin() {
    try {
      const adminId = await this.adminFriend.getPrimaryAdminId();
      if (!adminId) {
        throw new InternalServerErrorException('系统中没有管理员账号');
      }

      const users = await this.prisma.user.findMany({
        where: { NOT: { id: adminId }, role: { not: 'admin' } },
        select: { id: true, username: true },
      });

      let succeeded = 0;
      const failures: string[] = [];

      for (const u of users) {
        try {
          await this.adminFriend.ensureFriendshipWithAdmin(u.id);
          succeeded++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          failures.push(`${u.username}(${u.id}): ${msg}`);
        }
      }

      return {
        success: true,
        message: `已为 ${succeeded} 个用户与主管理员（ID:${adminId}）补全好友关系`,
        data: {
          primaryAdminId: adminId,
          totalUsers: users.length,
          succeeded,
          failures: failures.slice(0, 30),
        },
      };
    } catch (e) {
      if (e instanceof InternalServerErrorException) throw e;
      throw new InternalServerErrorException('同步好友关系失败');
    }
  }

  async listUsers() {
    try {
      const users = await this.prisma.user.findMany({
        orderBy: { id: 'asc' },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          status: true,
          storageQuota: true,
          storageUsed: true,
          createdAt: true,
          sessionVersion: true,
          lastSessionKickAt: true,
        },
      });

      return {
        success: true,
        data: users.map((u) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          role: u.role,
          status: u.status,
          storage_quota: Number(u.storageQuota),
          storage_used: Number(u.storageUsed),
          created_at: u.createdAt,
          session_version: u.sessionVersion,
          last_session_kick_at: u.lastSessionKickAt
            ? u.lastSessionKickAt.toISOString()
            : null,
        })),
      };
    } catch {
      throw new InternalServerErrorException('获取用户列表失败');
    }
  }

  async updateUserStatus(
    adminId: number,
    targetId: number,
    status: unknown,
  ) {
    if (Number.isNaN(targetId)) {
      throw new BadRequestException('无效的用户 ID');
    }
    if (status !== 'active' && status !== 'disabled') {
      throw new BadRequestException('状态必须为 active 或 disabled');
    }
    if (targetId === adminId) {
      throw new BadRequestException('不能禁用自己的账号');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { role: true },
    });
    if (!target) {
      throw new NotFoundException('用户不存在');
    }
    if (target.role === 'admin' && status === 'disabled') {
      throw new BadRequestException('不能禁用管理员账号');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetId },
        data: {
          status: status as 'active' | 'disabled',
          ...(status === 'disabled'
            ? { sessionVersion: { increment: 1 }, lastSessionKickAt: new Date() }
            : { lastSessionKickAt: null }),
        },
      });
      if (status === 'disabled') {
        await tx.refreshToken.updateMany({
          where: { userId: targetId },
          data: { isRevoked: true },
        });
      }
    });

    return { success: true, message: '用户状态已更新' };
  }

  async resetUserPassword(targetId: number) {
    if (Number.isNaN(targetId)) {
      throw new BadRequestException('无效的用户 ID');
    }

    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException('用户不存在');
    }

    const hashed = this.passwordPolicy.hashPassword(ADMIN_TEMP_RESET_PASSWORD);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetId },
        data: {
          password: hashed,
          mustChangePassword: true,
          sessionVersion: { increment: 1 },
          lastSessionKickAt: new Date(),
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: targetId },
        data: { isRevoked: true },
      });
    });

    return {
      success: true,
      message:
        '密码已重置。请用户使用统一临时密码登录，登录后须立即修改为符合策略的新密码。',
    };
  }

  async kickUserSessions(adminId: number, targetId: number) {
    if (Number.isNaN(targetId)) {
      throw new BadRequestException('无效的用户 ID');
    }
    if (targetId === adminId) {
      throw new BadRequestException('不能踢出当前登录的管理员会话');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException('用户不存在');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetId },
        data: {
          sessionVersion: { increment: 1 },
          lastSessionKickAt: new Date(),
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: targetId },
        data: { isRevoked: true },
      });
    });

    return { success: true, message: '已踢出该用户所有会话' };
  }

  async clearUserSessionKickMarker(targetId: number) {
    if (Number.isNaN(targetId)) {
      throw new BadRequestException('无效的用户 ID');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException('用户不存在');
    }

    await this.prisma.user.update({
      where: { id: targetId },
      data: { lastSessionKickAt: null },
    });

    return { success: true, message: '已恢复登录状态展示为正常' };
  }

  async getAdminSystemSettings() {
    try {
      const s = await this.passwordPolicy.getSystemSettings();
      const pool = this.passwordPolicy.parseRequiredCategoriesFromSettingsJson(
        s.passwordRequiredCategories,
        [...defaultPasswordCategories],
      );
      const poolMin = Math.max(1, Math.min(pool.length, s.passwordMinCategoriesInPool));

      return {
        success: true,
        data: {
          passwordMinLength: s.passwordMinLength,
          passwordRequiredCategories: pool,
          passwordMinCategoriesInPool: poolMin,
          storageQuotaUserBytes: s.storageQuotaUserBytes.toString(),
          storageQuotaVipBytes: s.storageQuotaVipBytes.toString(),
          storageQuotaAdminBytes: s.storageQuotaAdminBytes.toString(),
          maxTagsUser: s.maxTagsUser,
          maxTagsVip: s.maxTagsVip,
          updatedAt: s.updatedAt.toISOString(),
        },
      };
    } catch {
      throw new InternalServerErrorException('获取系统配置失败');
    }
  }

  async updateAdminSystemSettings(body: {
    passwordMinLength?: number;
    passwordRequiredCategories?: unknown;
    passwordMinCategoriesInPool?: number;
    storageQuotaUserBytes?: string | number;
    storageQuotaVipBytes?: string | number;
    storageQuotaAdminBytes?: string | number;
    maxTagsUser?: number;
    maxTagsVip?: number;
  }) {
    try {
      const current = await this.passwordPolicy.getSystemSettings();
      const passwordMinLength = clampInt(
        body.passwordMinLength,
        4,
        128,
        current.passwordMinLength,
      );

      let categoriesJsonSource: Prisma.JsonValue =
        current.passwordRequiredCategories;
      if (body.passwordRequiredCategories !== undefined) {
        const parsed = this.passwordPolicy.parseAdminRequiredCategories(
          body.passwordRequiredCategories,
        );
        if (!parsed) {
          throw new BadRequestException('须至少勾选一类有效字符');
        }
        categoriesJsonSource = parsed;
      }

      const poolArr =
        this.passwordPolicy.parseRequiredCategoriesFromSettingsJson(
          categoriesJsonSource,
          [...defaultPasswordCategories],
        );
      const poolLen = poolArr.length;
      const prevMin = Math.max(
        1,
        Math.min(current.passwordMinCategoriesInPool, poolLen),
      );
      const passwordMinCategoriesInPool = clampInt(
        body.passwordMinCategoriesInPool,
        1,
        poolLen,
        prevMin,
      );

      const nextPasswordRequiredCategories: Prisma.InputJsonValue = [
        ...poolArr,
      ];

      const updated = await this.prisma.systemSettings.update({
        where: { id: 1 },
        data: {
          passwordMinLength,
          passwordRequiredCategories: nextPasswordRequiredCategories,
          passwordMinCategoriesInPool,
          storageQuotaUserBytes: parsePositiveBigInt(
            body.storageQuotaUserBytes,
            current.storageQuotaUserBytes,
          ),
          storageQuotaVipBytes: parsePositiveBigInt(
            body.storageQuotaVipBytes,
            current.storageQuotaVipBytes,
          ),
          storageQuotaAdminBytes: parsePositiveBigInt(
            body.storageQuotaAdminBytes,
            current.storageQuotaAdminBytes,
          ),
          maxTagsUser: clampInt(body.maxTagsUser, 0, 100000, current.maxTagsUser),
          maxTagsVip: clampInt(body.maxTagsVip, 0, 100000, current.maxTagsVip),
        },
      });

      const updatedPool =
        this.passwordPolicy.parseRequiredCategoriesFromSettingsJson(
          updated.passwordRequiredCategories,
          [...defaultPasswordCategories],
        );

      return {
        success: true,
        message: '系统配置已保存',
        data: {
          passwordMinLength: updated.passwordMinLength,
          passwordRequiredCategories: updatedPool,
          passwordMinCategoriesInPool: Math.max(
            1,
            Math.min(updatedPool.length, updated.passwordMinCategoriesInPool),
          ),
          storageQuotaUserBytes: updated.storageQuotaUserBytes.toString(),
          storageQuotaVipBytes: updated.storageQuotaVipBytes.toString(),
          storageQuotaAdminBytes: updated.storageQuotaAdminBytes.toString(),
          maxTagsUser: updated.maxTagsUser,
          maxTagsVip: updated.maxTagsVip,
          updatedAt: updated.updatedAt.toISOString(),
        },
      };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new InternalServerErrorException('保存系统配置失败');
    }
  }
}
