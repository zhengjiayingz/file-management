import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role, type User } from '@prisma/client';
import type { Request } from 'express';
import { PasswordPolicyService } from '@/common/password-policy/password-policy.service';
import { PrismaService } from '@/prisma/prisma.service';
import { InvalidRevokeSessionError, SessionLimitError } from '../auth.errors';
import type { LoginDto } from '../dto/login.dto';
import { SessionService } from './session.service';
import { MfaService } from './mfa.service';

import { canUseTts } from '@/files/ai/tts/tts-access.util';

type UserWithTotp = User & {
  totpEnabled: boolean;
  totpSecret: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly sessionService: SessionService,
    private readonly mfaService: MfaService,
  ) {}

  async login(dto: LoginDto, req: Request) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (!user) {
      await this.logFailedLogin(null, req, '用户不存在');
      throw new UnauthorizedException('用户名或密码错误');
    }

    if (user.status !== 'active') {
      await this.logFailedLogin(user.id, req, '账户已被禁用');
      throw new ForbiddenException('账号处在封禁状态，请联系管理员');
    }

    const hashed = this.passwordPolicy.hashPassword(dto.password);
    if (hashed !== user.password) {
      await this.logFailedLogin(user.id, req, '密码错误');
      throw new UnauthorizedException('用户名或密码错误');
    }

    const settings = await this.passwordPolicy.getSystemSettings();
    const policy = this.passwordPolicy.settingsRowToPolicy(settings);
    const needPolicyChange =
      this.passwordPolicy.validatePasswordStrengthWithPolicy(
        dto.password,
        policy,
      ) !== null;
    const finalMustChange = user.mustChangePassword || needPolicyChange;

    const mfaRequired =
      user.totpEnabled === true &&
      Boolean(user.totpSecret && user.totpSecret.length > 0);
    if (mfaRequired) {
      const mfaToken = this.mfaService.signMfaLoginToken({
        uid: user.id,
        finalMustChange,
        needPolicyChange,
      });
      return {
        success: true,
        code: 'MFA_REQUIRED',
        message: '请输入验证器中的动态码',
        data: { mfaToken, expiresIn: 300 },
      };
    }

    let revokeId: number | undefined;
    if (dto.revokeSessionId != null) {
      const rid = Number(dto.revokeSessionId);
      if (!Number.isInteger(rid) || rid <= 0) {
        throw new BadRequestException('无效的会话参数');
      }
      revokeId = rid;
    }

    try {
      const tokens = await this.sessionService.runLoginSessionTransaction(
        req,
        user,
        finalMustChange,
        revokeId,
      );
      return {
        success: true,
        message: '登录成功',
        data: {
          user: this.toUserDto(user, finalMustChange),
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          ...(needPolicyChange
            ? {
                password_policy_hint:
                  this.passwordPolicy.describePasswordPolicy(policy),
                password_policy: this.passwordPolicy.policyToPublicDTO(policy),
              }
            : {}),
        },
      };
    } catch (err) {
      if (err instanceof SessionLimitError) {
        const sessions = await this.sessionService.listActiveSessions(err.uid);
        const maxSessions = this.sessionService.getMaxSessionSlots(
          err.role as Role,
        );
        throw new ConflictException({
          success: false,
          code: 'SESSION_LIMIT',
          message: '会话数达到上限',
          data: {
            maxSessions,
            sessions,
            showVipLink: err.role === 'user',
          },
        });
      }
      if (err instanceof InvalidRevokeSessionError) {
        throw new BadRequestException('无效的会话或已失效');
      }
      throw err;
    }
  }

  async refresh(refreshToken: string) {
    const { accessToken } = await this.sessionService.refresh(refreshToken);
    return {
      success: true,
      message: 'Token 刷新成功',
      data: { accessToken },
    };
  }

  async logout(refreshToken?: string) {
    await this.sessionService.logout(refreshToken);
    return { success: true, message: '登出成功' };
  }

  async getPasswordPolicy() {
    const settings = await this.passwordPolicy.getSystemSettings();
    const policy = this.passwordPolicy.settingsRowToPolicy(settings);
    return {
      success: true,
      data: this.passwordPolicy.policyToPublicDTO(policy),
    };
  }

  async getCurrentUser(userId: number) {
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        ttsEnabled: true,
        storageQuota: true,
        storageUsed: true,
        status: true,
        mustChangePassword: true,
        createdAt: true,
        avatarUrl: true,
        vipExpireAt: true,
        totpEnabled: true,
        totpSetupSecret: true,
      },
    })) as {
      id: number;
      username: string;
      email: string | null;
      role: string;
      ttsEnabled: boolean;
      storageQuota: bigint;
      storageUsed: bigint;
      status: string;
      mustChangePassword: boolean;
      createdAt: Date;
      avatarUrl: string | null;
      vipExpireAt: Date | null;
      totpEnabled: boolean;
      totpSetupSecret: string | null;
    } | null;

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        storage_quota: Number(user.storageQuota),
        storage_used: Number(user.storageUsed),
        status: user.status,
        must_change_password: user.mustChangePassword,
        created_at: user.createdAt,
        avatar_url: user.avatarUrl ?? null,
        vip_expire_at: user.vipExpireAt ? user.vipExpireAt.toISOString() : null,
        totp_enabled: user.totpEnabled,
        mfa_setup_pending: Boolean(user.totpSetupSecret),
        can_use_tts: canUseTts({
          role: user.role,
          ttsEnabled: user.ttsEnabled,
        }),
      },
    };
  }

  private async logFailedLogin(
    userId: number | null,
    req: Request,
    failReason: string,
  ) {
    await this.prisma.loginLog.create({
      data: {
        userId: userId ?? undefined,
        ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || null,
        status: 'failed',
        failReason,
      },
    });
  }

  private toUserDto(user: UserWithTotp, finalMustChange: boolean) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      storage_quota: Number(user.storageQuota),
      storage_used: Number(user.storageUsed),
      must_change_password: finalMustChange,
      avatar_url: user.avatarUrl ?? null,
      vip_expire_at: user.vipExpireAt ? user.vipExpireAt.toISOString() : null,
      created_at: user.createdAt.toISOString(),
      totp_enabled: user.totpEnabled,
      can_use_tts: canUseTts(user),
    };
  }
}
