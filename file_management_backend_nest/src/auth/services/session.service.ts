import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { InvalidRevokeSessionError, SessionLimitError } from '../auth.errors';

export type SessionDto = {
  id: number;
  ipAddress: string | null;
  userAgent: string | null;
  deviceName: string | null;
  deviceType: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  generateAccessToken(
    userId: number,
    username: string,
    mustChangePassword: boolean,
    sessionVersion: number,
  ): string {
    return this.jwtService.sign({
      id: userId,
      username,
      mustChangePassword,
      sv: sessionVersion,
    });
  }

  generateRefreshToken(): string {
    return randomBytes(64).toString('hex');
  }

  getMaxSessionSlots(role: Role): number | null {
    if (role === 'admin') return null;
    if (role === 'vip') return 5;
    return 2;
  }

  async runLoginSessionTransaction(
    req: Request,
    user: { id: number; username: string; role: Role },
    finalMustChange: boolean,
    revokeId: number | undefined,
  ) {
    const limit = this.getMaxSessionSlots(user.role);

    return this.prisma.$transaction(
      async (tx) => {
        if (revokeId != null) {
          const revoked = await tx.refreshToken.updateMany({
            where: { id: revokeId, userId: user.id, isRevoked: false },
            data: { isRevoked: true },
          });
          if (revoked.count === 0) {
            throw new InvalidRevokeSessionError();
          }
        }

        const activeWhere = {
          userId: user.id,
          isRevoked: false,
          expiresAt: { gt: new Date() },
        };
        const activeCount = await tx.refreshToken.count({ where: activeWhere });

        if (limit !== null && activeCount >= limit) {
          throw new SessionLimitError(user.id, user.role);
        }

        const uAfter = await tx.user.update({
          where: { id: user.id },
          data: {
            lastSessionKickAt: null,
            mustChangePassword: finalMustChange,
            ...(revokeId != null ? { sessionVersion: { increment: 1 } } : {}),
          },
          select: { sessionVersion: true },
        });

        const accessToken = this.generateAccessToken(
          user.id,
          user.username,
          finalMustChange,
          uAfter.sessionVersion,
        );
        const refreshToken = this.generateRefreshToken();

        await tx.refreshToken.create({
          data: {
            userId: user.id,
            token: refreshToken,
            deviceType: 'web',
            ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
            userAgent: req.get('User-Agent') || null,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });

        await tx.loginLog.create({
          data: {
            userId: user.id,
            ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
            userAgent: req.get('User-Agent') || null,
            status: 'success',
          },
        });

        return { accessToken, refreshToken };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }

  async listActiveSessions(userId: number): Promise<SessionDto[]> {
    const rows = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        deviceName: true,
        deviceType: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      deviceName: r.deviceName,
      deviceType: r.deviceType,
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    }));
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('请提供 Refresh Token');
    }

    const tokenRecord = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            status: true,
            mustChangePassword: true,
            sessionVersion: true,
          },
        },
      },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Refresh Token 无效或已过期');
    }

    if (tokenRecord.user.status !== 'active') {
      await this.prisma.refreshToken.updateMany({
        where: { userId: tokenRecord.userId },
        data: { isRevoked: true },
      });
      throw new ForbiddenException('账号处在封禁状态，请联系管理员');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { lastUsedAt: new Date() },
      });

      const accessToken = this.generateAccessToken(
        tokenRecord.user.id,
        tokenRecord.user.username,
        tokenRecord.user.mustChangePassword,
        tokenRecord.user.sessionVersion,
      );

      return { accessToken };
    });

    return result;
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { isRevoked: true },
      });
    }
  }

  async listSessionsForUser(userId: number, clientRefresh?: string) {
    const sessions = await this.listActiveSessions(userId);

    let currentSessionId: number | null = null;
    if (clientRefresh) {
      const row = await this.prisma.refreshToken.findFirst({
        where: { token: clientRefresh, userId, isRevoked: false },
        select: { id: true },
      });
      if (row) currentSessionId = row.id;
    }

    return { success: true, data: { sessions, currentSessionId } };
  }

  async revokeSessions(userId: number, ids: number[], clientRefresh?: string) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('请选择要登出的会话');
    }

    const uniqueIds = [...new Set(ids.map((x) => Number(x)))].filter(
      (n) => Number.isInteger(n) && n > 0,
    );
    if (uniqueIds.length === 0) {
      throw new BadRequestException('无效的会话参数');
    }

    let currentSessionId: number | null = null;
    if (clientRefresh) {
      const row = await this.prisma.refreshToken.findFirst({
        where: { token: clientRefresh, userId, isRevoked: false },
        select: { id: true },
      });
      if (row) currentSessionId = row.id;
    }

    const revokeSelf =
      currentSessionId !== null && uniqueIds.includes(currentSessionId);

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const revoked = await tx.refreshToken.updateMany({
            where: { userId, id: { in: uniqueIds }, isRevoked: false },
            data: { isRevoked: true },
          });
          if (revoked.count !== uniqueIds.length) {
            throw new InvalidRevokeSessionError();
          }

          await tx.user.update({
            where: { id: userId },
            data: { sessionVersion: { increment: 1 } },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 10000,
        },
      );
    } catch (err) {
      if (err instanceof InvalidRevokeSessionError) {
        throw new BadRequestException('部分会话无效或已失效');
      }
      throw err;
    }

    if (revokeSelf) {
      throw new UnauthorizedException({
        success: false,
        code: 'SESSION_REVOKED_SELF',
        message: '当前设备会话已登出，请重新登录',
      });
    }

    return { success: true, message: '已登出所选设备' };
  }
}
