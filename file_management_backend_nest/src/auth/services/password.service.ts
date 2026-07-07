import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminFriendService } from '@/common/admin-friend/admin-friend.service';
import { PasswordPolicyService } from '@/common/password-policy/password-policy.service';
import { PrismaService } from '@/prisma/prisma.service';
import type { ChangePasswordDto } from '../dto/change-password.dto';
import type { RegisterDto } from '../dto/register.dto';
import { SessionService } from './session.service';

@Injectable()
export class PasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly sessionService: SessionService,
    private readonly adminFriend: AdminFriendService,
  ) {}

  async register(dto: RegisterDto, req: Request) {
    if (!dto.username || !dto.password) {
      throw new BadRequestException('请提供用户名和密码');
    }

    if (dto.username.length < 3 || dto.username.length > 50) {
      throw new BadRequestException('用户名长度必须在3-50个字符之间');
    }

    const settings = await this.passwordPolicy.getSystemSettings();
    const regPolicy = this.passwordPolicy.settingsRowToPolicy(settings);
    const strengthErr = this.passwordPolicy.validatePasswordStrengthWithPolicy(
      dto.password,
      regPolicy,
    );
    if (strengthErr) {
      throw new BadRequestException(strengthErr);
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existingUser) {
      throw new BadRequestException('用户名已存在');
    }

    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new BadRequestException('邮箱已被注册');
      }
    }

    const hashedPassword = this.passwordPolicy.hashPassword(dto.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username: dto.username,
          password: hashedPassword,
          email: dto.email || null,
          role: 'user',
          storageQuota: settings.storageQuotaUserBytes,
          storageUsed: BigInt(0),
          status: 'active',
        },
      });

      const accessToken = this.sessionService.generateAccessToken(
        newUser.id,
        newUser.username,
        false,
        newUser.sessionVersion,
      );
      const refreshToken = this.sessionService.generateRefreshToken();

      await tx.refreshToken.create({
        data: {
          userId: newUser.id,
          token: refreshToken,
          deviceType: 'web',
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      await tx.loginLog.create({
        data: {
          userId: newUser.id,
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          status: 'success',
        },
      });

      return { newUser, accessToken, refreshToken };
    });

    try {
      await this.adminFriend.ensureFriendshipWithAdmin(result.newUser.id);
    } catch {
      // 与 Express 一致：好友关系失败不阻断注册
    }

    return {
      success: true,
      message: '注册成功',
      data: {
        user: {
          id: result.newUser.id,
          username: result.newUser.username,
          email: result.newUser.email,
          role: result.newUser.role,
          storage_quota: Number(result.newUser.storageQuota),
          storage_used: Number(result.newUser.storageUsed),
          must_change_password: false,
          avatar_url: result.newUser.avatarUrl ?? null,
          vip_expire_at: result.newUser.vipExpireAt
            ? result.newUser.vipExpireAt.toISOString()
            : null,
          created_at: result.newUser.createdAt.toISOString(),
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
    };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    if (!dto.newPassword) {
      throw new BadRequestException('请提供新密码');
    }

    const settingsPw = await this.passwordPolicy.getSystemSettings();
    const strengthErr = this.passwordPolicy.validatePasswordStrengthWithPolicy(
      dto.newPassword,
      this.passwordPolicy.settingsRowToPolicy(settingsPw),
    );
    if (strengthErr) {
      throw new BadRequestException(strengthErr);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        password: true,
        storageQuota: true,
        storageUsed: true,
        mustChangePassword: true,
      },
    });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (!user.mustChangePassword) {
      if (!dto.currentPassword) {
        throw new BadRequestException('请提供当前密码');
      }
      if (
        this.passwordPolicy.hashPassword(dto.currentPassword) !== user.password
      ) {
        throw new BadRequestException('当前密码错误');
      }
    }

    if (this.passwordPolicy.hashPassword(dto.newPassword) === user.password) {
      throw new BadRequestException('新密码不能与当前密码相同');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: this.passwordPolicy.hashPassword(dto.newPassword),
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
      },
    });

    const userAfter = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { sessionVersion: true },
    });
    const accessToken = this.sessionService.generateAccessToken(
      user.id,
      user.username,
      false,
      userAfter?.sessionVersion ?? 0,
    );

    return {
      success: true,
      message: '密码已修改',
      data: {
        accessToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          storage_quota: Number(user.storageQuota),
          storage_used: Number(user.storageUsed),
          must_change_password: false,
        },
      },
    };
  }

  async forgotPassword(username: string) {
    const trimmed = username?.trim();
    if (!trimmed) {
      throw new BadRequestException('请填写用户名');
    }

    const adminId = await this.adminFriend.getPrimaryAdminId();
    const user = await this.prisma.user.findUnique({
      where: { username: trimmed },
      select: { id: true, username: true, role: true },
    });

    if (adminId && user && user.role !== 'admin') {
      try {
        await this.adminFriend.ensureFriendshipWithAdmin(user.id);
        await this.prisma.message.create({
          data: {
            senderId: user.id,
            receiverId: adminId,
            content: `[忘记密码] 用户 ${user.username}（ID:${user.id}）请求管理员重置密码。`,
            messageType: 'text',
          },
        });
        // Socket 推送在 S9 补全；DB 写入即可
      } catch {
        // 与 Express 一致：失败仍返回成功提示
      }
    }

    return { success: true, message: '请等待管理员重置密码' };
  }
}
