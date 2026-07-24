import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { resolveStorageFilePath } from '@/files/utils/storagePath.utils';

type ValidityPreset = '1d' | '7d' | '30d' | '1y' | 'forever';

const VISITOR_LIMIT_CODE = 'VISITOR_LIMIT';

function computeExpireAt(validity: ValidityPreset): Date | null {
  if (validity === 'forever') return null;
  const d = new Date();
  switch (validity) {
    case '1d':
      d.setDate(d.getDate() + 1);
      break;
    case '7d':
      d.setDate(d.getDate() + 7);
      break;
    case '30d':
      d.setDate(d.getDate() + 30);
      break;
    case '1y':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setDate(d.getDate() + 30);
  }
  return d;
}

function genShareCode(): string {
  return crypto.randomBytes(8).toString('hex').slice(0, 16);
}

function genRandomExtract(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) {
    s += chars[crypto.randomInt(0, chars.length)];
  }
  return s;
}

export function clientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) {
    return xf.split(',')[0].trim().slice(0, 45);
  }
  return (req.socket.remoteAddress || '0.0.0.0').slice(0, 45);
}

export function isVisitorLimitError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e as NodeJS.ErrnoException).code === VISITOR_LIMIT_CODE
  );
}

function throwVisitorLimitError(): never {
  const e = new Error('分享访问人数已达上限');
  (e as NodeJS.ErrnoException).code = VISITOR_LIMIT_CODE;
  throw e;
}

export async function ensureVisitorAllowedInTx(
  tx: Prisma.TransactionClient,
  share: { id: number; maxVisitors: number | null },
  ip: string,
  visitorUserId?: number | null,
): Promise<void> {
  if (share.maxVisitors == null) return;
  await tx.$executeRawUnsafe(
    `SELECT id FROM file_shares WHERE id = ? FOR UPDATE`,
    share.id,
  );

  const logs = await tx.shareAccessLog.findMany({
    where: { shareId: share.id },
    select: { visitorId: true, ipAddress: true },
  });

  if (visitorUserId != null && visitorUserId !== undefined) {
    const loggedInIds = new Set(
      logs.filter((l) => l.visitorId != null).map((l) => l.visitorId as number),
    );
    if (loggedInIds.has(visitorUserId)) return;
    if (loggedInIds.size >= share.maxVisitors) {
      throwVisitorLimitError();
    }
    return;
  }

  const ipKeys = new Set(
    logs.filter((l) => l.visitorId == null).map((l) => `ip:${l.ipAddress}`),
  );
  const currentIpKey = `ip:${ip}`;
  if (ipKeys.has(currentIpKey)) return;
  if (ipKeys.size >= share.maxVisitors) {
    throwVisitorLimitError();
  }
}

function idsFromShare(share: {
  userFileId: number;
  userFileIds: Prisma.JsonValue | null;
}): number[] {
  const raw = share.userFileIds;
  if (raw != null && Array.isArray(raw)) {
    const nums = raw
      .map((x) => Number(x))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (nums.length > 0) return [...new Set(nums)];
  }
  return [share.userFileId];
}

function extractMatches(
  share: { extractCode: string | null },
  provided: string,
): boolean {
  const need = share.extractCode ? share.extractCode.trim().toUpperCase() : '';
  if (!need) return true;
  const got = (provided || '').trim().toUpperCase();
  return got === need;
}

@Injectable()
export class ShareService {
  constructor(private readonly prisma: PrismaService) {}

  private async findActiveShare(shareCode: string) {
    const share = await this.prisma.fileShare.findFirst({
      where: { shareCode, status: 'active' },
    });
    if (!share) return { error: 'not_found' as const };
    if (share.expireAt && share.expireAt < new Date()) {
      await this.prisma.fileShare
        .update({ where: { id: share.id }, data: { status: 'expired' } })
        .catch(() => undefined);
      return { error: 'expired' as const };
    }
    return { share };
  }

  async verifySharedFileForSave(
    shareCode: string,
    extractCode: string | undefined,
    userFileId: number,
  ): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
    const found = await this.findActiveShare(shareCode);
    if ('error' in found) {
      const msg =
        found.error === 'expired' ? '分享已过期' : '分享不存在或已失效';
      return { ok: false, status: 404, message: msg };
    }
    if (!extractMatches(found.share, extractCode ?? '')) {
      return { ok: false, status: 403, message: '提取码错误或缺失' };
    }
    if (!idsFromShare(found.share).includes(userFileId)) {
      return { ok: false, status: 403, message: '文件不在该分享中' };
    }
    return { ok: true };
  }

  async getPublicShareMeta(shareCode: string) {
    const trimmed = shareCode.trim();
    if (!trimmed) {
      throw new BadRequestException({
        success: false,
        message: '无效的分享链接',
      });
    }

    const found = await this.findActiveShare(trimmed);
    if ('error' in found) {
      const msg =
        found.error === 'expired' ? '分享已过期' : '分享不存在或已失效';
      throw new NotFoundException({ success: false, message: msg });
    }

    const { share } = found;
    const ids = idsFromShare(share);
    return {
      success: true,
      data: {
        shareCode: share.shareCode,
        needExtract: Boolean(share.extractCode),
        itemCount: ids.length,
        expireAt: share.expireAt,
      },
    };
  }

  async accessPublicShare(
    shareCode: string,
    req: Request,
    body?: { extractCode?: string },
  ) {
    const trimmed = shareCode.trim();
    if (!trimmed) {
      throw new BadRequestException({
        success: false,
        message: '无效的分享链接',
      });
    }

    const found = await this.findActiveShare(trimmed);
    if ('error' in found) {
      const msg =
        found.error === 'expired' ? '分享已过期' : '分享不存在或已失效';
      throw new NotFoundException({ success: false, message: msg });
    }

    const { share } = found;
    const provided =
      typeof body?.extractCode === 'string'
        ? body.extractCode
        : typeof req.query.e === 'string'
          ? req.query.e
          : '';

    if (!extractMatches(share, provided)) {
      throw new ForbiddenException({
        success: false,
        message: '提取码错误或缺失',
      });
    }

    const ip = clientIp(req);
    try {
      await this.prisma.$transaction(async (tx) => {
        await ensureVisitorAllowedInTx(tx, share, ip);
        await tx.fileShare.update({
          where: { id: share.id },
          data: { viewCount: { increment: 1 } },
        });
        await tx.shareAccessLog.create({
          data: {
            shareId: share.id,
            visitorId: null,
            ipAddress: ip,
            userAgent: (req.headers['user-agent'] || '').slice(0, 500) || null,
            action: 'view',
          },
        });
      });
    } catch (e) {
      if (isVisitorLimitError(e)) {
        throw new ForbiddenException({
          success: false,
          message: '分享访问人数已达上限',
        });
      }
      throw e;
    }

    const ids = idsFromShare(share);
    const rows = await this.prisma.userFile.findMany({
      where: { id: { in: ids }, userId: share.userId, isDeleted: false },
      include: {
        storage: { select: { fileSize: true, mimeType: true } },
      },
      orderBy: [{ fileType: 'desc' }, { fileName: 'asc' }],
    });

    const owner = await this.prisma.user.findUnique({
      where: { id: share.userId },
      select: { username: true },
    });

    return {
      success: true,
      data: {
        shareCode: share.shareCode,
        extractCode: share.extractCode,
        ownerUsername: owner?.username ?? null,
        files: rows.map((f) => ({
          id: f.id,
          fileName: f.fileName,
          fileType: f.fileType,
          size: f.storage ? Number(f.storage.fileSize) : 0,
          mimeType: f.storage?.mimeType ?? null,
          downloadable: f.fileType === 'file' && Boolean(f.storageId),
        })),
      },
    };
  }

  async downloadSharedFile(
    shareCode: string,
    userFileId: number,
    req: Request,
    res: Response,
  ): Promise<void> {
    const trimmed = shareCode.trim();
    if (!trimmed || !Number.isInteger(userFileId) || userFileId <= 0) {
      res.status(400).json({ success: false, message: '无效的请求' });
      return;
    }

    const found = await this.findActiveShare(trimmed);
    if ('error' in found) {
      res.status(404).json({
        success: false,
        message:
          found.error === 'expired' ? '分享已过期' : '分享不存在或已失效',
      });
      return;
    }

    const { share } = found;
    const extractQ =
      typeof req.query.extractCode === 'string'
        ? req.query.extractCode
        : typeof req.query.e === 'string'
          ? req.query.e
          : '';

    if (!extractMatches(share, extractQ)) {
      res.status(403).json({ success: false, message: '提取码错误或缺失' });
      return;
    }

    const allowed = idsFromShare(share);
    if (!allowed.includes(userFileId)) {
      res.status(404).json({ success: false, message: '文件不在此分享中' });
      return;
    }

    const userFile = await this.prisma.userFile.findFirst({
      where: {
        id: userFileId,
        userId: share.userId,
        isDeleted: false,
      },
      include: {
        storage: { select: { filePath: true, mimeType: true } },
      },
    });

    if (!userFile || userFile.fileType !== 'file' || !userFile.storage) {
      res.status(400).json({
        success: false,
        message: '该条目不是可下载的文件（文件夹请登录网盘查看）',
      });
      return;
    }

    const physicalPath = resolveStorageFilePath(userFile.storage.filePath);
    if (!fs.existsSync(physicalPath)) {
      res.status(404).json({ success: false, message: '文件已不可用' });
      return;
    }

    const ip = clientIp(req);
    try {
      await this.prisma.$transaction(async (tx) => {
        await ensureVisitorAllowedInTx(tx, share, ip);
        await tx.fileShare.update({
          where: { id: share.id },
          data: { downloadCount: { increment: 1 } },
        });
        await tx.shareAccessLog.create({
          data: {
            shareId: share.id,
            visitorId: null,
            ipAddress: ip,
            userAgent: (req.headers['user-agent'] || '').slice(0, 500) || null,
            action: 'download',
          },
        });
      });
    } catch (e) {
      if (isVisitorLimitError(e)) {
        res.status(403).json({
          success: false,
          message: '分享访问人数已达上限',
        });
        return;
      }
      throw e;
    }

    let contentType = userFile.storage.mimeType;
    const ext = path.extname(userFile.fileName).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.pdf': 'application/pdf',
    };
    if (mimeMap[ext]) contentType = mimeMap[ext];

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(userFile.fileName)}"`,
    );
    res.setHeader('Content-Type', contentType);
    res.sendFile(physicalPath);
  }

  async createShare(
    userId: number,
    body: {
      userFileIds?: unknown;
      validity?: unknown;
      extractMode?: unknown;
      customExtract?: unknown;
      autoFillExtract?: unknown;
      maxVisitors?: unknown;
    },
  ) {
    const {
      userFileIds,
      validity = '30d',
      extractMode = 'random',
      customExtract,
      autoFillExtract = false,
      maxVisitors = null,
    } = body;

    if (!Array.isArray(userFileIds) || userFileIds.length === 0) {
      throw new BadRequestException({
        success: false,
        message: '请选择要分享的文件或文件夹',
      });
    }

    const uniqueIds = [
      ...new Set(
        userFileIds
          .map((id) => Number(id))
          .filter((n) => Number.isInteger(n) && n > 0),
      ),
    ];
    if (uniqueIds.length === 0) {
      throw new BadRequestException({
        success: false,
        message: '无效的文件 ID',
      });
    }

    let extractCode: string | null;
    if (extractMode === 'custom') {
      const raw =
        typeof customExtract === 'string'
          ? customExtract.trim().toUpperCase()
          : '';
      if (!/^[A-Z0-9]{4}$/.test(raw)) {
        throw new BadRequestException({
          success: false,
          message: '自定义提取码须为 4 位字母或数字',
        });
      }
      extractCode = raw;
    } else {
      extractCode = genRandomExtract();
    }

    if (maxVisitors !== null && maxVisitors !== undefined) {
      const n = Number(maxVisitors);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        throw new BadRequestException({
          success: false,
          message: '访问人数限制须为 1～10 或留空表示不限制',
        });
      }
    }

    const rows = await this.prisma.userFile.findMany({
      where: {
        id: { in: uniqueIds },
        userId,
        isDeleted: false,
      },
      select: { id: true },
    });

    if (rows.length !== uniqueIds.length) {
      throw new BadRequestException({
        success: false,
        message: '部分文件不存在、已删除或无权分享',
      });
    }

    const expireAt = computeExpireAt(validity as ValidityPreset);
    const primaryUserFileId = uniqueIds[0];

    let shareCode = '';
    let created = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      shareCode = genShareCode();
      try {
        created = await this.prisma.fileShare.create({
          data: {
            userId,
            userFileId: primaryUserFileId,
            userFileIds: uniqueIds,
            shareCode,
            extractCode,
            expireAt,
            autoFillExtract: Boolean(autoFillExtract),
            maxVisitors: maxVisitors == null ? null : Number(maxVisitors),
            permission: 'download',
            status: 'active',
          },
        });
        break;
      } catch (e: unknown) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          continue;
        }
        throw e;
      }
    }

    if (!created) {
      throw new BadRequestException({
        success: false,
        message: '生成分享码失败，请重试',
      });
    }

    return {
      success: true,
      data: {
        shareId: created.id,
        shareCode: created.shareCode,
        extractCode: created.extractCode,
        expireAt: created.expireAt,
        autoFillExtract: created.autoFillExtract,
        maxVisitors: created.maxVisitors,
        userFileIds: uniqueIds,
      },
    };
  }

  async listMyShares(userId: number) {
    const shares = await this.prisma.fileShare.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        userFile: { select: { fileName: true, fileType: true } },
      },
    });

    const data = shares.map((s) => {
      const ids = idsFromShare(s);
      const itemCount = ids.length;
      const firstName = s.userFile.fileName;
      const summary =
        itemCount <= 1 ? firstName : `${firstName} 等 ${itemCount} 项`;

      return {
        id: s.id,
        shareCode: s.shareCode,
        extractCode: s.extractCode,
        autoFillExtract: s.autoFillExtract,
        expireAt: s.expireAt ? s.expireAt.toISOString() : null,
        status: s.status,
        viewCount: s.viewCount,
        downloadCount: s.downloadCount,
        createdAt: s.createdAt.toISOString(),
        itemCount,
        summaryLabel: summary,
        primaryFileType: s.userFile.fileType,
      };
    });

    return { success: true, data };
  }

  async getShareAccessLogs(
    userId: number,
    shareId: number,
    page: number,
    pageSize: number,
  ) {
    const owned = await this.prisma.fileShare.findFirst({
      where: { id: shareId, userId },
      select: { id: true },
    });
    if (!owned) {
      throw new NotFoundException({
        success: false,
        message: '分享不存在或无权查看',
      });
    }

    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));

    const where = { shareId };
    const [total, rows] = await Promise.all([
      this.prisma.shareAccessLog.count({ where }),
      this.prisma.shareAccessLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
        select: {
          id: true,
          action: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      success: true,
      data: {
        list: rows.map((r) => ({
          id: r.id,
          action: r.action,
          ipAddress: r.ipAddress,
          userAgent: r.userAgent,
          createdAt: r.createdAt.toISOString(),
        })),
        total,
        page: safePage,
        pageSize: safePageSize,
      },
    };
  }
}
