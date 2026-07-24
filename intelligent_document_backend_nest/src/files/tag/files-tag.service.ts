import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Role } from '@prisma/client';
import { PasswordPolicyService } from '@/common/password-policy/password-policy.service';
import { PrismaService } from '@/prisma/prisma.service';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function normalizeColor(c: unknown): string | null {
  if (c == null || typeof c !== 'string') return null;
  const s = c.trim();
  if (!s) return null;
  if (HEX_COLOR.test(s)) return s;
  return null;
}

function isEffectiveVip(role: Role, vipExpireAt: Date | null): boolean {
  if (role !== 'vip') return false;
  if (!vipExpireAt) return true;
  return vipExpireAt > new Date();
}

function parseTagIdsBody(
  raw: unknown,
): { ok: true; ids: number[] } | { ok: false; message: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, message: 'tagIds 须为数组' };
  }
  const ids: number[] = [];
  for (const item of raw) {
    if (typeof item === 'number' && Number.isFinite(item)) {
      const n = Math.trunc(item);
      if (n !== item) {
        return { ok: false, message: 'tagIds 须为整数' };
      }
      ids.push(n);
      continue;
    }
    if (typeof item === 'string' && item.trim() !== '') {
      const n = parseInt(item.trim(), 10);
      if (Number.isNaN(n)) {
        return { ok: false, message: 'tagIds 内含无法解析的 id' };
      }
      ids.push(n);
      continue;
    }
    return { ok: false, message: 'tagIds 元素须为整数或可解析为整数的字符串' };
  }
  return { ok: true, ids };
}

@Injectable()
export class FilesTagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordPolicy: PasswordPolicyService,
  ) {}

  private async getMaxTagsForUser(userId: number): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, vipExpireAt: true },
    });
    if (!user) return 0;
    if (user.role === 'admin') return Number.MAX_SAFE_INTEGER;

    const settings = await this.passwordPolicy.getSystemSettings();
    if (isEffectiveVip(user.role, user.vipExpireAt)) {
      return Math.max(0, settings.maxTagsVip);
    }
    return Math.max(0, settings.maxTagsUser);
  }

  async listTags(userId: number) {
    const tags = await this.prisma.fileTag.findMany({
      where: { userId },
      orderBy: { tagName: 'asc' },
    });
    return {
      success: true,
      data: tags.map((t) => ({
        id: t.id,
        tagName: t.tagName,
        color: t.color,
      })),
    };
  }

  async createTag(
    userId: number,
    body: { tagName?: unknown; color?: unknown },
  ) {
    const { tagName } = body;
    if (!tagName || typeof tagName !== 'string' || !tagName.trim()) {
      throw new BadRequestException('标签名称不能为空');
    }
    const name = tagName.trim().slice(0, 50);
    const color = normalizeColor(body?.color);

    const existing = await this.prisma.fileTag.findFirst({
      where: { userId, tagName: name },
    });
    if (existing) {
      throw new ConflictException('已存在同名标签');
    }

    const maxTags = await this.getMaxTagsForUser(userId);
    const currentCount = await this.prisma.fileTag.count({
      where: { userId },
    });
    if (currentCount >= maxTags) {
      throw new BadRequestException(`标签数量已达上限（最多 ${maxTags} 个）`);
    }

    const tag = await this.prisma.fileTag.create({
      data: { userId, tagName: name, color },
    });
    return {
      success: true,
      data: { id: tag.id, tagName: tag.tagName, color: tag.color },
    };
  }

  async updateTag(
    userId: number,
    tagId: number,
    body: { tagName?: unknown; color?: unknown },
  ) {
    if (Number.isNaN(tagId)) {
      throw new BadRequestException('无效的标签ID');
    }

    const tag = await this.prisma.fileTag.findFirst({
      where: { id: tagId, userId },
    });
    if (!tag) {
      throw new NotFoundException('标签不存在');
    }

    const data: { tagName?: string; color?: string | null } = {};
    const { tagName } = body;

    if (tagName !== undefined) {
      if (typeof tagName !== 'string' || !tagName.trim()) {
        throw new BadRequestException('标签名称不能为空');
      }
      const name = tagName.trim().slice(0, 50);
      const dup = await this.prisma.fileTag.findFirst({
        where: { userId, tagName: name, NOT: { id: tagId } },
      });
      if (dup) {
        throw new ConflictException('已存在同名标签');
      }
      data.tagName = name;
    }

    if (body.color !== undefined) {
      data.color = normalizeColor(body.color);
    }

    if (Object.keys(data).length === 0) {
      return {
        success: true,
        data: { id: tag.id, tagName: tag.tagName, color: tag.color },
      };
    }

    const updated = await this.prisma.fileTag.update({
      where: { id: tagId },
      data,
    });
    return {
      success: true,
      data: {
        id: updated.id,
        tagName: updated.tagName,
        color: updated.color,
      },
    };
  }

  async deleteTag(userId: number, tagId: number) {
    if (Number.isNaN(tagId)) {
      throw new BadRequestException('无效的标签ID');
    }

    const tag = await this.prisma.fileTag.findFirst({
      where: { id: tagId, userId },
    });
    if (!tag) {
      throw new NotFoundException('标签不存在');
    }

    await this.prisma.fileTag.delete({ where: { id: tagId } });
    return { success: true, message: '已删除标签' };
  }

  async setFileTags(userId: number, fileId: number, tagIdsRaw: unknown) {
    if (Number.isNaN(fileId)) {
      throw new BadRequestException('无效的文件ID');
    }

    const parsed = parseTagIdsBody(tagIdsRaw);
    if (!parsed.ok) {
      throw new BadRequestException(parsed.message);
    }
    const tagIds = parsed.ids;

    const userFile = await this.prisma.userFile.findFirst({
      where: { id: fileId, userId },
    });
    if (!userFile) {
      throw new NotFoundException('文件不存在');
    }

    const uniqueIds = [...new Set(tagIds)];
    if (uniqueIds.length > 0) {
      const count = await this.prisma.fileTag.count({
        where: { userId, id: { in: uniqueIds } },
      });
      if (count !== uniqueIds.length) {
        throw new BadRequestException('包含无效或不属于您的标签');
      }
    }

    await this.prisma.$transaction([
      this.prisma.userFileTag.deleteMany({ where: { userFileId: fileId } }),
      ...(uniqueIds.length
        ? [
            this.prisma.userFileTag.createMany({
              data: uniqueIds.map((tagId) => ({
                userFileId: fileId,
                tagId,
              })),
            }),
          ]
        : []),
    ]);

    const withTags = await this.prisma.userFile.findFirst({
      where: { id: fileId, userId },
      include: { userFileTags: { include: { tag: true } } },
    });

    return {
      success: true,
      data: {
        tags:
          withTags?.userFileTags.map((u) => ({
            id: u.tag.id,
            tagName: u.tag.tagName,
            color: u.tag.color,
          })) ?? [],
      },
    };
  }
}
