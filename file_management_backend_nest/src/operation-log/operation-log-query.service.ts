import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import type { RequestUser } from '@/auth/types/jwt-payload.type';

function storageWhereForMimeCategory(
  typeStr: string,
): Prisma.FileStorageWhereInput | null {
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
          { mimeType: { contains: 'document' } },
        ],
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
                { mimeType: { contains: 'document' } },
              ],
            },
          },
        ],
      };
    default:
      return null;
  }
}

@Injectable()
export class OperationLogQueryService {
  constructor(private readonly prisma: PrismaService) {}

  private async buildTransferLogWhere(
    req: Request,
    currentUserId: number,
  ): Promise<{ where: Prisma.OperationLogWhereInput; empty: boolean }> {
    const q = req.query.q ?? req.query.keyword;
    const { createdFrom, createdTo, type, entryKind, tagId: tagIdQuery } =
      req.query;

    const where: Prisma.OperationLogWhereInput = {
      userId: currentUserId,
      operationType: { in: ['UPLOAD', 'DOWNLOAD'] },
    };

    const cf = createdFrom ? String(createdFrom).trim() : '';
    const ct = createdTo ? String(createdTo).trim() : '';
    if (cf || ct) {
      where.createdAt = {};
      if (cf) {
        where.createdAt.gte = new Date(cf);
      }
      if (ct) {
        const end = new Date(ct);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const ek = entryKind ? String(entryKind) : 'all';
    const typeStr = type ? String(type) : 'all';
    const mimeWhere =
      typeStr !== 'all' ? storageWhereForMimeCategory(typeStr) : null;

    const andList: Prisma.OperationLogWhereInput[] = [];

    const tagIdNum =
      tagIdQuery !== undefined && tagIdQuery !== '' && tagIdQuery !== null
        ? parseInt(String(tagIdQuery), 10)
        : NaN;
    if (!Number.isNaN(tagIdNum)) {
      const tagged = await this.prisma.userFile.findMany({
        where: {
          userId: currentUserId,
          userFileTags: {
            some: {
              tagId: tagIdNum,
              tag: { userId: currentUserId },
            },
          },
        },
        select: { id: true },
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
        const filesMime = await this.prisma.userFile.findMany({
          where: {
            userId: currentUserId,
            fileType: 'file',
            storage: mimeWhere,
          },
          select: { id: true },
        });
        const ids = filesMime.map((f) => f.id);
        if (ids.length === 0) {
          return { where: {}, empty: true };
        }
        andList.push({ resourceType: 'FILE', resourceId: { in: ids } });
      } else {
        const filesMime = await this.prisma.userFile.findMany({
          where: {
            userId: currentUserId,
            fileType: 'file',
            storage: mimeWhere,
          },
          select: { id: true },
        });
        const mids = filesMime.map((f) => f.id);
        andList.push({
          OR: [
            { resourceType: 'FOLDER' },
            { AND: [{ resourceType: 'FILE' }, { resourceId: { in: mids } }] },
          ],
        });
      }
    } else {
      if (ek === 'file') {
        where.resourceType = 'FILE';
      } else if (ek === 'folder') {
        where.resourceType = 'FOLDER';
      }
    }

    if (q && String(q).trim()) {
      const trimmed = String(q).trim();
      const nameMatches = await this.prisma.userFile.findMany({
        where: {
          userId: currentUserId,
          fileName: { contains: trimmed },
        },
        select: { id: true },
      });
      const nids = nameMatches.map((f) => f.id);
      andList.push({
        OR: [{ description: { contains: trimmed } }, { resourceId: { in: nids } }],
      });
    }

    if (andList.length) {
      where.AND = andList;
    }

    return { where, empty: false };
  }

  async getOperationLogs(user: RequestUser, req: Request) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });
    if (!currentUser) {
      return {
        success: false,
        message: '用户不存在',
      };
    }

    const isAdmin = currentUser.role === 'admin';
    const page = parseInt(String(req.query.page), 10) || 1;
    const limit = parseInt(String(req.query.limit), 10) || 20;
    const skip = (page - 1) * limit;
    const transferOnly = String(req.query.transferOnly || '') === 'true';

    const {
      operationType,
      type,
      startDate,
      endDate,
      keyword,
      targetUserId,
      sortOrder,
      sortBy,
    } = req.query;

    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';
    const allowedSort = new Set([
      'id',
      'operationType',
      'resourceType',
      'description',
      'ipAddress',
      'createdAt',
    ]);
    const sortFieldRaw =
      sortBy != null && String(sortBy).trim() !== ''
        ? String(sortBy).trim()
        : 'createdAt';
    const orderByField = allowedSort.has(sortFieldRaw)
      ? sortFieldRaw
      : 'createdAt';

    let where: Prisma.OperationLogWhereInput = {};

    if (transferOnly) {
      const built = await this.buildTransferLogWhere(req, user.id);
      if (built.empty) {
        return {
          success: true,
          data: [],
          pagination: { total: 0, page, limit, totalPages: 0 },
        };
      }
      where = built.where;
    } else {
      if (!isAdmin) {
        where.userId = user.id;
      } else if (targetUserId) {
        where.userId = parseInt(String(targetUserId), 10);
      }

      if (operationType) {
        where.operationType = String(operationType);
      } else if (type) {
        where.operationType = String(type);
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = new Date(String(startDate));
        }
        if (endDate) {
          where.createdAt.lte = new Date(String(endDate));
        }
      }

      if (keyword) {
        where.description = { contains: String(keyword) };
      }
    }

    const total = await this.prisma.operationLog.count({ where });
    const logs = await this.prisma.operationLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [orderByField]: orderDir },
      include: {
        user: {
          select: { id: true, username: true, email: true },
        },
      },
    });

    return {
      success: true,
      data: logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
