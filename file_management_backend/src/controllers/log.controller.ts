
import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthRequest } from '../types/index.js';

/** 与 file/query.controller 中 storageWhereForMimeCategory 一致，用于上传/下载记录筛选 */
function storageWhereForMimeCategory(typeStr: string): Record<string, unknown> | null {
  switch (typeStr) {
    case 'image':
      return { mimeType: { startsWith: 'image/' } };
    case 'video':
      return { mimeType: { startsWith: 'video/' } };
    case 'audio':
      return { mimeType: { startsWith: 'audio/' } };
    case 'document':
      return {
        OR: [
          { mimeType: { startsWith: 'text/' } },
          { mimeType: { contains: 'pdf' } },
          { mimeType: { contains: 'word' } },
          { mimeType: { contains: 'excel' } },
          { mimeType: { contains: 'sheet' } },
          { mimeType: { contains: 'powerpoint' } },
          { mimeType: { contains: 'presentation' } },
          { mimeType: { contains: 'document' } }
        ]
      };
    case 'other':
      return {
        AND: [
          { mimeType: { not: { startsWith: 'image/' } } },
          { mimeType: { not: { startsWith: 'video/' } } },
          { mimeType: { not: { startsWith: 'audio/' } } },
          {
            NOT: {
              OR: [
                { mimeType: { startsWith: 'text/' } },
                { mimeType: { contains: 'pdf' } },
                { mimeType: { contains: 'word' } },
                { mimeType: { contains: 'excel' } },
                { mimeType: { contains: 'sheet' } },
                { mimeType: { contains: 'powerpoint' } },
                { mimeType: { contains: 'presentation' } },
                { mimeType: { contains: 'document' } }
              ]
            }
          }
        ]
      };
    default:
      return null;
  }
}

/**
 * 上传/下载记录：仅当前用户、操作类型 UPLOAD/DOWNLOAD，筛选参数与文件列表接口（q、createdFrom、createdTo、type、entryKind、tagId）对齐
 */
async function buildTransferLogWhere(
  req: AuthRequest,
  currentUserId: number
): Promise<{ where: Record<string, unknown>; empty: boolean }> {
  const q = req.query.q ?? req.query.keyword;
  const { createdFrom, createdTo, type, entryKind, tagId: tagIdQuery } = req.query;

  const where: Record<string, unknown> = {
    userId: currentUserId,
    operationType: { in: ['UPLOAD', 'DOWNLOAD'] }
  };

  const cf = createdFrom ? String(createdFrom).trim() : '';
  const ct = createdTo ? String(createdTo).trim() : '';
  if (cf || ct) {
    (where as any).createdAt = {};
    if (cf) {
      (where as any).createdAt.gte = new Date(cf);
    }
    if (ct) {
      const end = new Date(ct);
      end.setHours(23, 59, 59, 999);
      (where as any).createdAt.lte = end;
    }
  }

  const ek = entryKind ? String(entryKind) : 'all';
  const typeStr = type ? String(type) : 'all';
  const mimeWhere = typeStr !== 'all' ? storageWhereForMimeCategory(typeStr) : null;

  const andList: Record<string, unknown>[] = [];

  const tagIdNum =
    tagIdQuery !== undefined && tagIdQuery !== '' && tagIdQuery !== null
      ? parseInt(String(tagIdQuery), 10)
      : NaN;
  if (!isNaN(tagIdNum)) {
    const tagged = await prisma.userFile.findMany({
      where: {
        userId: currentUserId,
        userFileTags: {
          some: {
            tagId: tagIdNum,
            tag: { userId: currentUserId }
          }
        }
      },
      select: { id: true }
    });
    const tids = tagged.map((t) => t.id);
    if (tids.length === 0) {
      return { where: {}, empty: true };
    }
    andList.push({ resourceId: { in: tids } });
  }

  if (mimeWhere) {
    if (ek === 'folder') {
      return { where: {}, empty: true };
    }
    if (ek === 'file') {
      const filesMime = await prisma.userFile.findMany({
        where: {
          userId: currentUserId,
          fileType: 'file',
          storage: mimeWhere as any
        },
        select: { id: true }
      });
      const ids = filesMime.map((f) => f.id);
      if (ids.length === 0) {
        return { where: {}, empty: true };
      }
      andList.push({ resourceType: 'FILE', resourceId: { in: ids } });
    } else {
      const filesMime = await prisma.userFile.findMany({
        where: {
          userId: currentUserId,
          fileType: 'file',
          storage: mimeWhere as any
        },
        select: { id: true }
      });
      const mids = filesMime.map((f) => f.id);
      andList.push({
        OR: [
          { resourceType: 'FOLDER' },
          { AND: [{ resourceType: 'FILE' }, { resourceId: { in: mids } }] }
        ]
      });
    }
  } else {
    if (ek === 'file') {
      (where as any).resourceType = 'FILE';
    } else if (ek === 'folder') {
      (where as any).resourceType = 'FOLDER';
    }
  }

  if (q && String(q).trim()) {
    const trimmed = String(q).trim();
    const nameMatches = await prisma.userFile.findMany({
      where: {
        userId: currentUserId,
        fileName: { contains: trimmed }
      },
      select: { id: true }
    });
    const nids = nameMatches.map((f) => f.id);
    andList.push({
      OR: [{ description: { contains: trimmed } }, { resourceId: { in: nids } }]
    });
  }

  if (andList.length) {
    (where as any).AND = andList;
  }

  return { where, empty: false };
}

/**
 * 获取操作日志
 * 支持：分页，搜索（类型、日期、关键字、用户），排序
 * transferOnly=true：仅当前用户的上传/下载记录，筛选与文件列表一致（q、createdFrom、createdTo、type、entryKind、tagId）
 */
export const getOperationLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const currentUserId = req.user.id;

    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId }
    });

    if (!currentUser) {
      res.status(401).json({ success: false, message: '用户不存在' });
      return;
    }

    const isAdmin = currentUser.role === 'admin';

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const transferOnly = String(req.query.transferOnly || '') === 'true';

    const { operationType, type, startDate, endDate, keyword, targetUserId, sortOrder } = req.query;

    let where: any = {};

    if (transferOnly) {
      const built = await buildTransferLogWhere(req, currentUserId);
      if (built.empty) {
        res.json({
          success: true,
          data: [],
          pagination: {
            total: 0,
            page,
            limit,
            totalPages: 0
          }
        });
        return;
      }
      where = built.where;
    } else {
      if (!isAdmin) {
        where.userId = currentUserId;
      } else if (targetUserId) {
        where.userId = parseInt(targetUserId as string);
      }

      if (operationType) {
        where.operationType = operationType;
      } else if (type) {
        where.operationType = type;
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = new Date(startDate as string);
        }
        if (endDate) {
          where.createdAt.lte = new Date(endDate as string);
        }
      }

      if (keyword) {
        where.description = {
          contains: keyword as string
        };
      }
    }

    const total = await prisma.operationLog.count({ where });

    const logs = await prisma.operationLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: sortOrder === 'asc' ? 'asc' : 'desc'
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ success: false, message: '获取日志列表失败' });
  }
};
