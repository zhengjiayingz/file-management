import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { Prisma, Role } from '@prisma/client';
import type { Request } from 'express';
import { PasswordPolicyService } from '@/common/password-policy/password-policy.service';
import { PrismaService } from '@/prisma/prisma.service';
import { InvalidRevokeSessionError, SessionLimitError } from '../auth.errors';
import type { MfaVerifyDto } from '../dto/mfa-verify.dto';
import { SessionService } from './session.service';
import { canUseTts } from '@/files/ai/tts/utils/tts-access.util';

const MFA_LOGIN_JWT_TYP = 'mfa_login';
const TOTP_ISSUER = 'FileManagement';

type MfaLoginJwtPayload = {
  typ: typeof MFA_LOGIN_JWT_TYP;
  uid: number;
  fc: 0 | 1;
  pc: 0 | 1;
};

const userUpdateData = (d: Record<string, unknown>): Prisma.UserUpdateInput =>
  d;

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly sessionService: SessionService,
  ) {}

  signMfaLoginToken(p: {
    uid: number;
    finalMustChange: boolean;
    needPolicyChange: boolean;
  }): string {
    const body: MfaLoginJwtPayload = {
      typ: MFA_LOGIN_JWT_TYP,
      uid: p.uid,
      fc: p.finalMustChange ? 1 : 0,
      pc: p.needPolicyChange ? 1 : 0,
    };
    return this.jwtService.sign(body, { expiresIn: '5m' });
  }

  parseMfaLoginToken(token: string): MfaLoginJwtPayload | null {
    try {
      const decoded = this.jwtService.verify<MfaLoginJwtPayload>(token);
      if (
        decoded?.typ !== MFA_LOGIN_JWT_TYP ||
        typeof decoded.uid !== 'number'
      ) {
        return null;
      }
      return decoded;
    } catch {
      return null;
    }
  }

  async verifyMfaLogin(dto: MfaVerifyDto, req: Request) {
    const mfaToken = dto.mfaToken?.trim() ?? '';
    const code = dto.code?.trim().replace(/\s/g, '') ?? '';
    if (!mfaToken || !code) {
      throw new BadRequestException('请提供 mfaToken 与 6 位动态码');
    }

    const payload = this.parseMfaLoginToken(mfaToken);
    if (!payload) {
      throw new UnauthorizedException('验证已过期，请从用户名密码重新登录');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.uid },
    });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('用户无效');
    }
    if (
      !user.totpEnabled ||
      !user.totpSecret ||
      verifySync({ token: code, secret: user.totpSecret }).valid === false
    ) {
      await this.prisma.loginLog.create({
        data: {
          userId: user.id,
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          status: 'failed',
          failReason: 'MFA 验证失败',
        },
      });
      throw new UnauthorizedException('动态码错误');
    }

    const finalMustChange = payload.fc === 1;
    const needPolicyChange = payload.pc === 1;
    const settings = await this.passwordPolicy.getSystemSettings();
    const policy = this.passwordPolicy.settingsRowToPolicy(settings);

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
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            storage_quota: Number(user.storageQuota),
            storage_used: Number(user.storageUsed),
            must_change_password: finalMustChange,
            avatar_url: user.avatarUrl ?? null,
            vip_expire_at: user.vipExpireAt
              ? user.vipExpireAt.toISOString()
              : null,
            created_at: user.createdAt.toISOString(),
            totp_enabled: true,
            can_use_tts: canUseTts(user),
          },
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
          data: { maxSessions, sessions, showVipLink: err.role === 'user' },
        });
      }
      if (err instanceof InvalidRevokeSessionError) {
        throw new BadRequestException('无效的会话或已失效');
      }
      throw err;
    }
  }

  async setupStart(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, totpEnabled: true, username: true },
    });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    if (user.totpEnabled) {
      throw new BadRequestException('已开启两步验证，请先关闭后再重新绑定');
    }

    const secret = generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: userUpdateData({ totpSetupSecret: secret }),
    });
    const otpauthUrl = generateURI({
      issuer: TOTP_ISSUER,
      label: user.username,
      secret,
    });

    return {
      success: true,
      data: { otpauthUrl, accountLabel: user.username },
    };
  }

  async setupConfirm(userId: number, code: string) {
    const normalized = code.trim().replace(/\s/g, '');
    if (normalized.length !== 6) {
      throw new BadRequestException('请输入 6 位动态码');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, totpEnabled: true, totpSetupSecret: true },
    });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    if (user.totpEnabled || !user.totpSetupSecret) {
      throw new BadRequestException('无待确认绑定，请先在设置中开始绑定');
    }
    if (
      !verifySync({ token: normalized, secret: user.totpSetupSecret }).valid
    ) {
      throw new BadRequestException('动态码错误');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: userUpdateData({
        totpEnabled: true,
        totpSecret: user.totpSetupSecret,
        totpSetupSecret: null,
      }),
    });

    return { success: true, message: '两步验证已开启' };
  }

  async setupCancel(userId: number) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, totpEnabled: true },
    });
    if (!u) {
      throw new NotFoundException('用户不存在');
    }
    if (u.totpEnabled) {
      throw new BadRequestException('已开启，请用「关闭两步验证」');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: userUpdateData({ totpSetupSecret: null }),
    });
    return { success: true, message: '已取消' };
  }

  async disable(userId: number, password: string, code: string) {
    const normalizedCode = code.trim().replace(/\s/g, '');
    if (!password) {
      throw new BadRequestException('请输入登录密码');
    }
    if (normalizedCode.length !== 6) {
      throw new BadRequestException('请输入验证器 6 位码');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.totpEnabled || !user.totpSecret) {
      throw new BadRequestException('未开启两步验证');
    }
    if (this.passwordPolicy.hashPassword(password) !== user.password) {
      throw new BadRequestException('密码错误');
    }
    if (!verifySync({ token: normalizedCode, secret: user.totpSecret }).valid) {
      throw new BadRequestException('动态码错误');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: userUpdateData({
        totpEnabled: false,
        totpSecret: null,
        totpSetupSecret: null,
        sessionVersion: { increment: 1 },
      }),
    });

    return { success: true, message: '已关闭两步验证' };
  }
}
