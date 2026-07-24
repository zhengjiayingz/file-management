import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { isValidEmailFormat } from '@/common/utils/email.util';
import { PrismaService } from '@/prisma/prisma.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';

const profileSelect = {
  id: true,
  username: true,
  email: true,
  role: true,
  storageQuota: true,
  storageUsed: true,
  status: true,
  vipExpireAt: true,
  avatarUrl: true,
  createdAt: true,
  totpEnabled: true,
  totpSetupSecret: true,
} as const;

type ProfileRow = Prisma.UserGetPayload<{ select: typeof profileSelect }>;

function profilePayload(user: ProfileRow) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    storage_quota: Number(user.storageQuota),
    storage_used: Number(user.storageUsed),
    status: user.status,
    vip_expire_at: user.vipExpireAt ? user.vipExpireAt.toISOString() : null,
    avatar_url: user.avatarUrl,
    created_at: user.createdAt.toISOString(),
    totp_enabled: user.totpEnabled,
    mfa_setup_pending: Boolean(user.totpSetupSecret),
  };
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return {
      success: true,
      data: profilePayload(user),
    };
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    if (dto.email === undefined) {
      throw new BadRequestException('请提供要更新的字段');
    }

    let nextEmail: string | null;
    if (dto.email === null || dto.email === '') {
      nextEmail = null;
    } else if (typeof dto.email === 'string') {
      const trimmed = dto.email.trim();
      if (!trimmed) {
        nextEmail = null;
      } else if (!isValidEmailFormat(trimmed)) {
        throw new BadRequestException('邮箱格式不正确');
      } else {
        nextEmail = trimmed;
      }
    } else {
      throw new BadRequestException('邮箱格式不正确');
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: { email: nextEmail },
        select: profileSelect,
      });

      return {
        success: true,
        message: '用户资料更新成功',
        data: profilePayload(updatedUser),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('该邮箱已被其他账号使用');
      }
      throw error;
    }
  }

  async uploadAvatar(userId: number, file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('请选择图片文件');
    }

    const publicPath = `/uploads/avatars/${file.filename}`;

    const prev = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    if (prev?.avatarUrl?.startsWith('/uploads/avatars/')) {
      const abs = resolveAvatarAbsPath(prev.avatarUrl);
      try {
        if (existsSync(abs)) unlinkSync(abs);
      } catch {
        // ignore
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: publicPath },
    });

    return {
      success: true,
      message: '头像已更新',
      data: { avatar_url: publicPath },
    };
  }

  async searchUsers(userId: number, keyword?: string) {
    if (!keyword?.trim()) {
      return {
        success: true,
        data: [] as Array<{
          id: number;
          username: string;
          email: string | null;
        }>,
      };
    }

    const kwStr = keyword.trim();
    const searchConditions: Prisma.UserWhereInput[] = [
      { username: { contains: kwStr } },
    ];

    if (/^\d+$/.test(kwStr)) {
      searchConditions.push({ id: parseInt(kwStr, 10) });
    }

    const users = await this.prisma.user.findMany({
      where: {
        OR: searchConditions,
        id: { not: userId },
      },
      select: {
        id: true,
        username: true,
        email: true,
      },
      take: 20,
    });

    return { success: true, data: users };
  }
}

function resolveAvatarAbsPath(publicPath: string): string {
  return join(
    process.cwd(),
    '..',
    'intelligent_document_backend',
    publicPath.replace(/^\//, ''),
  );
}
