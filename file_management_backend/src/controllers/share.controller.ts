import { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';
import { resolveStorageFilePath } from '../utils/storagePath.utils.js';

type ValidityPreset = '1d' | '7d' | '30d' | '1y' | 'forever';

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

/** 仅使用十六进制，避免部分 Node 版本不支持 base64url 编码名 */
function genShareCode(): string {
  return crypto.randomBytes(8).toString('hex').slice(0, 16);
}

function genRandomExtract(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) {
    s += chars[crypto.randomInt(0, chars.length)]!;
  }
  return s;
}

function clientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) {
    return xf.split(',')[0]!.trim().slice(0, 45);
  }
  return (req.socket.remoteAddress || '0.0.0.0').slice(0, 45);
}

/** 分享包含的 user_files.id（兼容旧数据仅 userFileId） */
function idsFromShare(share: { userFileId: number; userFileIds: Prisma.JsonValue | null }): number[] {
  const raw = share.userFileIds;
  if (raw != null && Array.isArray(raw)) {
    const nums = raw.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
    if (nums.length > 0) return [...new Set(nums)];
  }
  return [share.userFileId];
}

async function findActiveShare(shareCode: string) {
  const share = await prisma.fileShare.findFirst({
    where: { shareCode, status: 'active' }
  });
  if (!share) return { error: 'not_found' as const };
  if (share.expireAt && share.expireAt < new Date()) {
    await prisma.fileShare.update({ where: { id: share.id }, data: { status: 'expired' } }).catch(() => undefined);
    return { error: 'expired' as const };
  }
  return { share };
}

function extractMatches(share: { extractCode: string | null }, provided: string): boolean {
  const need = share.extractCode ? share.extractCode.trim().toUpperCase() : '';
  if (!need) return true;
  const got = (provided || '').trim().toUpperCase();
  return got === need;
}

/**
 * 链接分享转存：校验源文件属于该分享且提取码正确（未传 shareCode 时兼容好友会话等旧路径）
 */
export async function verifySharedFileForSave(
  shareCode: string,
  extractCode: string | undefined,
  userFileId: number
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const found = await findActiveShare(shareCode);
  if ('error' in found) {
    const msg = found.error === 'expired' ? '分享已过期' : '分享不存在或已失效';
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

/**
 * 访客：分享基本信息（不含文件列表）
 */
export const getPublicShareMeta = async (req: Request, res: Response): Promise<void> => {
  try {
    const shareCode = String(req.params.shareCode || '').trim();
    if (!shareCode) {
      res.status(400).json({ success: false, message: '无效的分享链接' });
      return;
    }
    const found = await findActiveShare(shareCode);
    if ('error' in found) {
      const msg =
        found.error === 'expired' ? '分享已过期' : '分享不存在或已失效';
      res.status(404).json({ success: false, message: msg });
      return;
    }
    const { share } = found;
    const ids = idsFromShare(share);
    res.json({
      success: true,
      data: {
        shareCode: share.shareCode,
        needExtract: Boolean(share.extractCode),
        itemCount: ids.length,
        expireAt: share.expireAt
      }
    });
  } catch (error) {
    console.error('getPublicShareMeta error:', error);
    res.status(500).json({ success: false, message: '获取分享信息失败' });
  }
};

/**
 * 访客：校验提取码并返回文件列表（不含下载直链，由前端拼 URL）
 */
export const accessPublicShare = async (req: Request, res: Response): Promise<void> => {
  try {
    const shareCode = String(req.params.shareCode || '').trim();
    if (!shareCode) {
      res.status(400).json({ success: false, message: '无效的分享链接' });
      return;
    }
    const found = await findActiveShare(shareCode);
    if ('error' in found) {
      res.status(404).json({
        success: false,
        message: found.error === 'expired' ? '分享已过期' : '分享不存在或已失效'
      });
      return;
    }
    const { share } = found;
    const body = req.body as { extractCode?: string };
    const provided =
      typeof body?.extractCode === 'string'
        ? body.extractCode
        : typeof req.query.e === 'string'
          ? req.query.e
          : '';
    if (!extractMatches(share, provided)) {
      res.status(403).json({ success: false, message: '提取码错误或缺失' });
      return;
    }

    const ids = idsFromShare(share);
    const rows = await prisma.userFile.findMany({
      where: { id: { in: ids }, userId: share.userId, isDeleted: false },
      include: {
        storage: { select: { fileSize: true, mimeType: true } }
      },
      orderBy: [{ fileType: 'desc' }, { fileName: 'asc' }]
    });

    await prisma.fileShare.update({
      where: { id: share.id },
      data: { viewCount: { increment: 1 } }
    });

    await prisma.shareAccessLog.create({
      data: {
        shareId: share.id,
        visitorId: null,
        ipAddress: clientIp(req),
        userAgent: (req.headers['user-agent'] || '').slice(0, 500) || null,
        action: 'view'
      }
    });

    const owner = await prisma.user.findUnique({
      where: { id: share.userId },
      select: { username: true }
    });

    res.json({
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
          downloadable: f.fileType === 'file' && Boolean(f.storageId)
        }))
      }
    });
  } catch (error) {
    console.error('accessPublicShare error:', error);
    res.status(500).json({ success: false, message: '访问分享失败' });
  }
};

/**
 * 访客：下载分享中的单个文件（不支持文件夹）
 */
export const downloadSharedFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const shareCode = String(req.params.shareCode || '').trim();
    const fileId = parseInt(String(req.params.userFileId), 10);
    if (!shareCode || !Number.isInteger(fileId) || fileId <= 0) {
      res.status(400).json({ success: false, message: '无效的请求' });
      return;
    }

    const found = await findActiveShare(shareCode);
    if ('error' in found) {
      res.status(404).json({
        success: false,
        message: found.error === 'expired' ? '分享已过期' : '分享不存在或已失效'
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
    if (!allowed.includes(fileId)) {
      res.status(404).json({ success: false, message: '文件不在此分享中' });
      return;
    }

    const userFile = await prisma.userFile.findFirst({
      where: {
        id: fileId,
        userId: share.userId,
        isDeleted: false
      },
      include: {
        storage: { select: { filePath: true, mimeType: true } }
      }
    });

    if (!userFile || userFile.fileType !== 'file' || !userFile.storage) {
      res.status(400).json({
        success: false,
        message: '该条目不是可下载的文件（文件夹请登录网盘查看）'
      });
      return;
    }

    const physicalPath = resolveStorageFilePath(userFile.storage.filePath);
    if (!fs.existsSync(physicalPath)) {
      res.status(404).json({ success: false, message: '文件已不可用' });
      return;
    }

    let contentType = userFile.storage.mimeType;
    const ext = path.extname(userFile.fileName).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.pdf': 'application/pdf'
    };
    if (mimeMap[ext]) contentType = mimeMap[ext];

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(userFile.fileName)}"`
    );
    res.setHeader('Content-Type', contentType);

    await prisma.fileShare.update({
      where: { id: share.id },
      data: { downloadCount: { increment: 1 } }
    });

    await prisma.shareAccessLog.create({
      data: {
        shareId: share.id,
        visitorId: null,
        ipAddress: clientIp(req),
        userAgent: (req.headers['user-agent'] || '').slice(0, 500) || null,
        action: 'download'
      }
    });

    res.sendFile(physicalPath);
  } catch (error) {
    console.error('downloadSharedFile error:', error);
    res.status(500).json({ success: false, message: '下载失败' });
  }
};

/**
 * 创建链接分享（支持多选文件/文件夹）
 */
export const createShare = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const {
      userFileIds,
      validity = '30d',
      extractMode = 'random',
      customExtract,
      autoFillExtract = false,
      maxVisitors = null
    } = req.body as {
      userFileIds?: number[];
      validity?: ValidityPreset;
      extractMode?: 'random' | 'custom';
      customExtract?: string;
      autoFillExtract?: boolean;
      maxVisitors?: number | null;
    };

    if (!Array.isArray(userFileIds) || userFileIds.length === 0) {
      res.status(400).json({ success: false, message: '请选择要分享的文件或文件夹' });
      return;
    }

    const uniqueIds = [...new Set(userFileIds.map((id) => Number(id)).filter((n) => Number.isInteger(n) && n > 0))];
    if (uniqueIds.length === 0) {
      res.status(400).json({ success: false, message: '无效的文件 ID' });
      return;
    }

    let extractCode: string | null;
    if (extractMode === 'custom') {
      const raw = (customExtract ?? '').trim().toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(raw)) {
        res.status(400).json({ success: false, message: '自定义提取码须为 4 位字母或数字' });
        return;
      }
      extractCode = raw;
    } else {
      extractCode = genRandomExtract();
    }

    if (maxVisitors !== null && maxVisitors !== undefined) {
      const n = Number(maxVisitors);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        res.status(400).json({ success: false, message: '访问人数限制须为 1～10 或留空表示不限制' });
        return;
      }
    }

    const rows = await prisma.userFile.findMany({
      where: {
        id: { in: uniqueIds },
        userId,
        isDeleted: false
      },
      select: { id: true }
    });

    if (rows.length !== uniqueIds.length) {
      res.status(400).json({ success: false, message: '部分文件不存在、已删除或无权分享' });
      return;
    }

    const expireAt = computeExpireAt(validity);
    const primaryUserFileId = uniqueIds[0]!;
    const userFileIdsJson = uniqueIds;

    let shareCode = '';
    let created = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      shareCode = genShareCode();
      try {
        created = await prisma.fileShare.create({
          data: {
            userId,
            userFileId: primaryUserFileId,
            userFileIds: userFileIdsJson as Prisma.InputJsonValue,
            shareCode,
            extractCode,
            expireAt,
            autoFillExtract: Boolean(autoFillExtract),
            maxVisitors: maxVisitors == null ? null : Number(maxVisitors),
            permission: 'download',
            status: 'active'
          }
        });
        break;
      } catch (e: unknown) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          continue;
        }
        throw e;
      }
    }

    if (!created) {
      res.status(500).json({ success: false, message: '生成分享码失败，请重试' });
      return;
    }

    res.status(201).json({
      success: true,
      data: {
        shareId: created.id,
        shareCode: created.shareCode,
        extractCode: created.extractCode,
        expireAt: created.expireAt,
        autoFillExtract: created.autoFillExtract,
        maxVisitors: created.maxVisitors,
        userFileIds: uniqueIds
      }
    });
  } catch (error) {
    console.error('createShare error:', error);
    let message = '创建分享失败';
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      message = `[${error.code}] ${error.message}`;
    } else if (error instanceof Error) {
      message = error.message;
    }
    res.status(500).json({
      success: false,
      message,
      hint:
        process.env.NODE_ENV === 'development'
          ? '若提示 Unknown column，请在 backend 目录执行 npx prisma db push，或执行 scripts/add-file-shares-columns.sql'
          : undefined
    });
  }
};
