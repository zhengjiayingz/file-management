import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import path from 'node:path';
import {
  FileBatchHelper,
  ObjectNotFoundError,
} from '../helpers/file-batch.helper';
import {
  LogOperationType,
  LogResourceType,
  OperationLogService,
} from '@/operation-log/operation-log.service';
import { PrismaService } from '@/prisma/prisma.service';
import {
  clientIp,
  ensureVisitorAllowedInTx,
  isVisitorLimitError,
  ShareService,
} from '@/share/share.service';

const MAX_BATCH_PERMANENT_DELETE = 2000;
const MAX_BATCH_PERMANENT_DELETE_EXPANDED = 10000;
const MAX_BATCH_SOFT_DELETE_INPUT = 2000;
const MAX_BATCH_SOFT_DELETE_EXPANDED = 10000;
const MAX_BATCH_MOVE_INPUT = 2000;

function parseOptionalParentId(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return parseInt(value.trim(), 10);
  }
  return Number.NaN;
}

function parseNullableParentId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = parseInt(value.trim(), 10);
    if (!Number.isInteger(n)) {
      throw new BadRequestException('无效的目标文件夹');
    }
    return n;
  }
  throw new BadRequestException('无效的目标文件夹');
}

@Injectable()
export class FilesManageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationLogService: OperationLogService,
    private readonly fileBatchHelper: FileBatchHelper,
    private readonly shareService: ShareService,
  ) {}

  async renameFile(req: Request, userId: number, fileId: number, name: string) {
    if (Number.isNaN(fileId) || !name || !name.trim())
      throw new BadRequestException('参数无效');

    const userFile = await this.prisma.userFile.findFirst({
      where: { id: fileId, userId, isDeleted: false },
    });
    if (!userFile) throw new NotFoundException('文件不存在');

    const existingFile = await this.prisma.userFile.findFirst({
      where: {
        userId,
        parentId: userFile.parentId,
        fileName: name.trim(),
        isDeleted: false,
        id: { not: fileId },
      },
    });
    if (existingFile) throw new BadRequestException('名称已存在');

    await this.prisma.userFile.update({
      where: { id: fileId },
      data: { fileName: name.trim() },
    });

    await this.operationLogService.logOperation({
      req,
      userId,
      operationType: LogOperationType.RENAME,
      resourceType:
        userFile.fileType === 'folder'
          ? LogResourceType.FOLDER
          : LogResourceType.FILE,
      resourceId: fileId,
      description: `Renamed ${userFile.fileName} to ${name.trim()}`,
    });

    return { success: true, message: '重命名成功' };
  }

  async moveFile(
    req: Request,
    userId: number,
    fileId: number,
    parentIdRaw: unknown,
  ) {
    if (Number.isNaN(fileId)) throw new BadRequestException('文件ID无效');

    const userFile = await this.prisma.userFile.findFirst({
      where: { id: fileId, userId, isDeleted: false },
    });
    if (!userFile) throw new NotFoundException('文件不存在');

    // 与 Express 一致：parentId 为 0 / falsy 时视为根目录
    const targetParentId = (() => {
      if (
        parentIdRaw === null ||
        parentIdRaw === undefined ||
        parentIdRaw === '' ||
        parentIdRaw === 0
      ) {
        return null;
      }
      const p = parseOptionalParentId(parentIdRaw);
      return Number.isNaN(p) || p <= 0 ? null : p;
    })();

    if (targetParentId !== null) {
      const parentFolder = await this.prisma.userFile.findFirst({
        where: {
          id: targetParentId,
          userId,
          fileType: 'folder',
          isDeleted: false,
        },
      });
      if (!parentFolder) throw new NotFoundException('目标文件夹不存在');
    }

    await this.prisma.userFile.update({
      where: { id: fileId },
      data: { parentId: targetParentId },
    });

    await this.operationLogService.logOperation({
      req,
      userId,
      operationType: LogOperationType.MOVE,
      resourceType:
        userFile.fileType === 'folder'
          ? LogResourceType.FOLDER
          : LogResourceType.FILE,
      resourceId: fileId,
      description: `Moved ${userFile.fileName} to parentId: ${targetParentId ?? 'root'}`,
    });

    return { success: true, message: '移动成功' };
  }

  async deleteFile(req: Request, userId: number, fileId: number) {
    if (Number.isNaN(fileId)) throw new BadRequestException('无效的文件ID');

    const userFile = await this.prisma.userFile.findFirst({
      where: { id: fileId, userId, isDeleted: false },
    });
    if (!userFile) throw new NotFoundException('文件不存在');

    await this.prisma.userFile.update({
      where: { id: fileId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    await this.operationLogService.logOperation({
      req,
      userId,
      operationType: LogOperationType.DELETE,
      resourceType:
        userFile.fileType === 'folder'
          ? LogResourceType.FOLDER
          : LogResourceType.FILE,
      resourceId: fileId,
      description: `Moved to recycle bin: ${userFile.fileName}`,
    });

    return { success: true, message: '文件已移入回收站' };
  }

  async restoreFile(req: Request, userId: number, fileId: number) {
    if (Number.isNaN(fileId)) throw new BadRequestException('无效的文件ID');
    const userFile = await this.prisma.userFile.findFirst({
      where: { id: fileId, userId, isDeleted: true },
    });
    if (!userFile) throw new NotFoundException('回收站中找不到该文件');

    let newParentId = userFile.parentId;
    let restoreToRoot = false;
    if (newParentId) {
      const parentFolder = await this.prisma.userFile.findFirst({
        where: { id: newParentId, userId },
      });
      if (!parentFolder || parentFolder.isDeleted) {
        newParentId = null;
        restoreToRoot = true;
      }
    }

    await this.prisma.userFile.update({
      where: { id: fileId },
      data: { isDeleted: false, deletedAt: null, parentId: newParentId },
    });

    await this.operationLogService.logOperation({
      req,
      userId,
      operationType: LogOperationType.RESTORE,
      resourceType:
        userFile.fileType === 'folder'
          ? LogResourceType.FOLDER
          : LogResourceType.FILE,
      resourceId: fileId,
      description: `Restored file: ${userFile.fileName}${restoreToRoot ? ' (to root)' : ''}`,
    });

    return {
      success: true,
      message: restoreToRoot
        ? '原文件夹不存在或已删除，文件已还原到根目录'
        : '文件已还原',
    };
  }

  async permanentDeleteFile(req: Request, userId: number, fileId: number) {
    if (Number.isNaN(fileId)) throw new BadRequestException('无效的文件ID');

    const userFile = await this.prisma.userFile.findFirst({
      where: { id: fileId, userId, isDeleted: true },
      include: {
        storage: { select: { id: true, fileSize: true, filePath: true } },
      },
    });
    if (!userFile) throw new NotFoundException('回收站中找不到该文件');

    const fileSize = userFile.storage ? userFile.storage.fileSize : BigInt(0);
    const storageId = userFile.storageId;
    await this.prisma.$transaction(async (tx) => {
      await tx.userFile.delete({ where: { id: fileId } });
      if (storageId && userFile.storage) {
        await tx.user.update({
          where: { id: userId },
          data: { storageUsed: { decrement: fileSize } },
        });
        const updatedStorage = await tx.fileStorage.update({
          where: { id: storageId },
          data: { referenceCount: { decrement: 1 } },
        });
        if (updatedStorage.referenceCount <= 0) {
          await tx.fileStorage.update({
            where: { id: storageId },
            data: { status: 'pending_delete', markedDeleteAt: new Date() },
          });
        }
      }
    });

    await this.operationLogService.logOperation({
      req,
      userId,
      operationType: LogOperationType.PERMANENT_DELETE,
      resourceType:
        userFile.fileType === 'folder'
          ? LogResourceType.FOLDER
          : LogResourceType.FILE,
      resourceId: fileId,
      description: `Permanently deleted: ${userFile.fileName}`,
    });

    return { success: true, message: '文件已彻底删除' };
  }

  async deleteFilesBatch(req: Request, userId: number, idsRaw: unknown) {
    const uniqueIds = this.parseIds(idsRaw);
    if (uniqueIds.length === 0) throw new BadRequestException('无效的文件 ID');
    if (uniqueIds.length > MAX_BATCH_SOFT_DELETE_INPUT) {
      throw new BadRequestException(
        `单次最多删除 ${MAX_BATCH_SOFT_DELETE_INPUT} 项`,
      );
    }

    const initialRows = await this.prisma.userFile.findMany({
      where: { id: { in: uniqueIds }, userId, isDeleted: false },
      select: { id: true },
    });
    if (initialRows.length !== uniqueIds.length) {
      throw new BadRequestException('部分文件不存在或已删除');
    }

    const expanded = await this.fileBatchHelper.expandDescendants(
      userId,
      uniqueIds,
      false,
    );
    if (expanded.size > MAX_BATCH_SOFT_DELETE_EXPANDED) {
      throw new BadRequestException(
        `展开子项后数量超过上限（${MAX_BATCH_SOFT_DELETE_EXPANDED}）`,
      );
    }

    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.userFile.updateMany({
        where: { userId, id: { in: [...expanded] }, isDeleted: false },
        data: { isDeleted: true, deletedAt },
      });
    });

    await this.operationLogService.logOperation({
      req,
      userId,
      operationType: LogOperationType.DELETE,
      resourceType: LogResourceType.FILE,
      resourceId: uniqueIds[0],
      description: `Batch move to recycle bin (${expanded.size} items)`,
    });

    return {
      success: true,
      message: `已移入回收站 ${expanded.size} 项`,
      data: { deletedCount: expanded.size },
    };
  }

  async restoreFilesBatch(req: Request, userId: number, idsRaw: unknown) {
    const uniqueIds = this.parseIds(idsRaw);
    if (uniqueIds.length === 0) throw new BadRequestException('无效的文件 ID');
    if (uniqueIds.length > MAX_BATCH_PERMANENT_DELETE) {
      throw new BadRequestException(
        `单次最多还原 ${MAX_BATCH_PERMANENT_DELETE} 项`,
      );
    }

    const initialRows = await this.prisma.userFile.findMany({
      where: { id: { in: uniqueIds }, userId, isDeleted: true },
      select: { id: true },
    });
    if (initialRows.length !== uniqueIds.length) {
      throw new BadRequestException('部分文件不存在或不在回收站');
    }

    const expanded = await this.expandTree(userId, uniqueIds, true);
    if (expanded.size > MAX_BATCH_PERMANENT_DELETE_EXPANDED) {
      throw new BadRequestException(
        `展开子项后数量超过上限（${MAX_BATCH_PERMANENT_DELETE_EXPANDED}）`,
      );
    }

    const allNodes = await this.prisma.userFile.findMany({
      where: { id: { in: [...expanded] }, userId, isDeleted: true },
      select: { id: true, parentId: true, fileName: true, fileType: true },
    });
    if (allNodes.length !== expanded.size)
      throw new BadRequestException('批量还原数据不一致，请重试');

    const snapshot = new Map<number, { fileName: string; fileType: string }>(
      allNodes.map((uf) => [
        uf.id,
        { fileName: uf.fileName, fileType: uf.fileType },
      ]),
    );
    const order = this.preOrderRestoreIds(
      allNodes.map((n) => ({ id: n.id, parentId: n.parentId })),
    );
    const restoredIds: number[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const fileId of order) {
        const userFile = await tx.userFile.findFirst({
          where: { id: fileId, userId, isDeleted: true },
        });
        if (!userFile) continue;
        let newParentId = userFile.parentId;
        if (newParentId) {
          const parentFolder = await tx.userFile.findFirst({
            where: { id: newParentId, userId },
          });
          if (!parentFolder || parentFolder.isDeleted) newParentId = null;
        }
        await tx.userFile.update({
          where: { id: fileId },
          data: { isDeleted: false, deletedAt: null, parentId: newParentId },
        });
        restoredIds.push(fileId);
      }
    });

    for (const fileId of restoredIds) {
      const meta = snapshot.get(fileId);
      if (!meta) continue;
      await this.operationLogService.logOperation({
        req,
        userId,
        operationType: LogOperationType.RESTORE,
        resourceType:
          meta.fileType === 'folder'
            ? LogResourceType.FOLDER
            : LogResourceType.FILE,
        resourceId: fileId,
        description: `Restored file (batch): ${meta.fileName}`,
      });
    }

    return {
      success: true,
      message: `已还原 ${restoredIds.length} 项`,
      data: { restoredCount: restoredIds.length },
    };
  }

  async permanentDeleteFilesBatch(
    req: Request,
    userId: number,
    idsRaw: unknown,
  ) {
    const uniqueIds = this.parseIds(idsRaw);
    if (uniqueIds.length === 0) throw new BadRequestException('无效的文件 ID');
    if (uniqueIds.length > MAX_BATCH_PERMANENT_DELETE) {
      throw new BadRequestException(
        `单次最多删除 ${MAX_BATCH_PERMANENT_DELETE} 项`,
      );
    }

    const initialRows = await this.prisma.userFile.findMany({
      where: { id: { in: uniqueIds }, userId, isDeleted: true },
      select: { id: true },
    });
    if (initialRows.length !== uniqueIds.length) {
      throw new BadRequestException('部分文件不存在或不在回收站');
    }

    const expanded = await this.expandTree(userId, uniqueIds, true);
    if (expanded.size > MAX_BATCH_PERMANENT_DELETE_EXPANDED) {
      throw new BadRequestException(
        `展开子项后数量超过上限（${MAX_BATCH_PERMANENT_DELETE_EXPANDED}）`,
      );
    }

    const allNodes = await this.prisma.userFile.findMany({
      where: { id: { in: [...expanded] }, userId, isDeleted: true },
      include: {
        storage: { select: { id: true, fileSize: true, filePath: true } },
      },
    });
    if (allNodes.length !== expanded.size)
      throw new BadRequestException('批量删除数据不一致，请重试');

    const snapshot = new Map<number, { fileName: string; fileType: string }>(
      allNodes.map((uf) => [
        uf.id,
        { fileName: uf.fileName, fileType: uf.fileType },
      ]),
    );
    const order = this.postOrderDeletionIds(
      allNodes.map((n) => ({ id: n.id, parentId: n.parentId })),
    );
    const deletedIds: number[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const fileId of order) {
        const userFile = await tx.userFile.findFirst({
          where: { id: fileId, userId, isDeleted: true },
          include: {
            storage: { select: { id: true, fileSize: true, filePath: true } },
          },
        });
        if (!userFile) continue;
        const fileSize = userFile.storage
          ? userFile.storage.fileSize
          : BigInt(0);
        const storageId = userFile.storageId;
        await tx.userFile.delete({ where: { id: fileId } });
        deletedIds.push(fileId);

        if (storageId && userFile.storage) {
          await tx.user.update({
            where: { id: userId },
            data: { storageUsed: { decrement: fileSize } },
          });
          const updatedStorage = await tx.fileStorage.update({
            where: { id: storageId },
            data: { referenceCount: { decrement: 1 } },
          });
          if (updatedStorage.referenceCount <= 0) {
            await tx.fileStorage.update({
              where: { id: storageId },
              data: { status: 'pending_delete', markedDeleteAt: new Date() },
            });
          }
        }
      }
    });

    for (const fileId of deletedIds) {
      const meta = snapshot.get(fileId);
      if (!meta) continue;
      await this.operationLogService.logOperation({
        req,
        userId,
        operationType: LogOperationType.PERMANENT_DELETE,
        resourceType:
          meta.fileType === 'folder'
            ? LogResourceType.FOLDER
            : LogResourceType.FILE,
        resourceId: fileId,
        description: `Permanently deleted (batch): ${meta.fileName}`,
      });
    }

    return {
      success: true,
      message: `已彻底删除 ${deletedIds.length} 项`,
      data: { deletedCount: deletedIds.length },
    };
  }

  async moveFilesBatch(
    req: Request,
    userId: number,
    idsRaw: unknown,
    rawParent: unknown,
  ) {
    const uniqueIds = this.parseIds(idsRaw);
    if (uniqueIds.length === 0) throw new BadRequestException('无效的文件 ID');
    if (uniqueIds.length > MAX_BATCH_MOVE_INPUT) {
      throw new BadRequestException(`单次最多移动 ${MAX_BATCH_MOVE_INPUT} 项`);
    }

    let targetParentId: number | null = null;
    if (rawParent !== undefined && rawParent !== null && rawParent !== '') {
      const p = parseOptionalParentId(rawParent);
      if (Number.isNaN(p) || p <= 0)
        throw new BadRequestException('目标文件夹无效');
      targetParentId = p;
    }

    const rows = await this.prisma.userFile.findMany({
      where: { id: { in: uniqueIds }, userId, isDeleted: false },
      select: { id: true, parentId: true, fileName: true, fileType: true },
    });
    if (rows.length !== uniqueIds.length)
      throw new BadRequestException('部分文件不存在或已删除');

    const loadIds = [...uniqueIds];
    if (targetParentId !== null) loadIds.push(targetParentId);

    let pmap: Map<number, number | null>;
    try {
      pmap = await this.fileBatchHelper.loadParentChainMap(loadIds, userId);
    } catch (e) {
      if (e instanceof ObjectNotFoundError)
        throw new BadRequestException('目标路径或文件不存在');
      throw e;
    }

    if (targetParentId !== null) {
      const parentRow = await this.prisma.userFile.findFirst({
        where: {
          id: targetParentId,
          userId,
          isDeleted: false,
          fileType: 'folder',
        },
      });
      if (!parentRow) throw new NotFoundException('目标文件夹不存在');
    }

    const roots = this.fileBatchHelper.computeSelectionRoots(uniqueIds, pmap);
    const rootRows = rows
      .filter((r) => roots.includes(r.id))
      .sort((a, b) => a.id - b.id);
    for (const r of rootRows) {
      if (r.fileType === 'folder' && targetParentId !== null) {
        if (
          r.id === targetParentId ||
          this.fileBatchHelper.isNodeUnderAncestor(targetParentId, r.id, pmap)
        ) {
          throw new BadRequestException('不能将文件夹移动到自身或其子文件夹内');
        }
      }
    }

    const movingIds = new Set(rootRows.map((r) => r.id));
    const siblings = await this.prisma.userFile.findMany({
      where: {
        userId,
        isDeleted: false,
        parentId: targetParentId,
        id: { notIn: [...movingIds] },
      },
      select: { fileName: true },
    });
    const takenLower = new Set(siblings.map((s) => s.fileName.toLowerCase()));

    await this.prisma.$transaction(async (tx) => {
      for (const r of rootRows) {
        const origExt = path.extname(r.fileName);
        const origStem = path.basename(r.fileName, origExt);
        let finalName = r.fileName;
        let counter = 0;
        while (takenLower.has(finalName.toLowerCase())) {
          counter += 1;
          finalName = `${origStem} (${counter})${origExt}`;
        }
        takenLower.add(finalName.toLowerCase());

        await tx.userFile.update({
          where: { id: r.id },
          data: {
            parentId: targetParentId,
            ...(finalName !== r.fileName ? { fileName: finalName } : {}),
          },
        });
      }
    });

    await this.operationLogService.logOperation({
      req,
      userId,
      operationType: LogOperationType.MOVE,
      resourceType: LogResourceType.FOLDER,
      resourceId: rootRows[0]?.id,
      description: `Batch move ${rootRows.length} items to parentId ${targetParentId ?? 'root'}`,
    });

    return {
      success: true,
      message: `已移动 ${rootRows.length} 项`,
      data: { movedCount: rootRows.length },
    };
  }

  async saveSharedFileToMyDrive(
    req: Request,
    userId: number,
    sourceFileId: number,
    body: {
      parentId?: unknown;
      shareCode?: unknown;
      extractCode?: unknown;
    },
  ) {
    if (Number.isNaN(sourceFileId)) {
      throw new BadRequestException('无效的文件ID');
    }

    const parentId = parseNullableParentId(body.parentId);

    const sourceFile = await this.prisma.userFile.findFirst({
      where: {
        id: sourceFileId,
        isDeleted: false,
        fileType: 'file',
      },
      include: { storage: true },
    });

    if (!sourceFile?.storageId || !sourceFile.storage) {
      throw new NotFoundException('共享的原文件不存在或已删除');
    }

    const shareCodeStr =
      typeof body.shareCode === 'string' && body.shareCode.trim() !== ''
        ? body.shareCode.trim()
        : '';
    if (shareCodeStr) {
      const extractCode =
        typeof body.extractCode === 'string' ? body.extractCode : undefined;
      const v = await this.shareService.verifySharedFileForSave(
        shareCodeStr,
        extractCode,
        sourceFileId,
      );
      if (!v.ok) {
        if (v.status === 403) {
          throw new ForbiddenException({ success: false, message: v.message });
        }
        throw new NotFoundException({ success: false, message: v.message });
      }
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('当前用户不存在');
    }

    const fileSize = sourceFile.storage.fileSize;
    if (user.storageUsed + fileSize > user.storageQuota) {
      throw new BadRequestException('您的存储空间不足，无法保存');
    }

    if (parentId !== null) {
      const targetFolder = await this.prisma.userFile.findFirst({
        where: {
          id: parentId,
          userId,
          fileType: 'folder',
          isDeleted: false,
        },
      });
      if (!targetFolder) {
        throw new NotFoundException('目标存放文件夹不存在');
      }
    }

    let finalFileName = sourceFile.fileName;
    let counter = 1;
    let baseName = finalFileName;
    let ext = '';
    const lastDotIdx = finalFileName.lastIndexOf('.');
    if (lastDotIdx !== -1) {
      baseName = finalFileName.substring(0, lastDotIdx);
      ext = finalFileName.substring(lastDotIdx);
    }

    while (true) {
      const exists = await this.prisma.userFile.findFirst({
        where: {
          userId,
          parentId: parentId ?? null,
          fileName: finalFileName,
          isDeleted: false,
        },
      });
      if (!exists) break;
      finalFileName = `${baseName}(${counter})${ext}`;
      counter++;
    }

    const shareRow = shareCodeStr
      ? await this.prisma.fileShare.findFirst({
          where: { shareCode: shareCodeStr, status: 'active' },
        })
      : null;

    let newFile;
    try {
      newFile = await this.prisma.$transaction(async (tx) => {
        if (shareRow) {
          await ensureVisitorAllowedInTx(
            tx,
            shareRow,
            clientIp(req),
            userId,
          );
          await tx.shareAccessLog.create({
            data: {
              shareId: shareRow.id,
              visitorId: userId,
              ipAddress: clientIp(req),
              userAgent:
                (req.headers['user-agent'] || '').slice(0, 500) || null,
              action: 'save',
            },
          });
        }

        await tx.user.update({
          where: { id: userId },
          data: { storageUsed: { increment: fileSize } },
        });

        await tx.fileStorage.update({
          where: { id: sourceFile.storageId! },
          data: { referenceCount: { increment: 1 } },
        });

        return tx.userFile.create({
          data: {
            userId,
            storageId: sourceFile.storageId,
            parentId: parentId ?? null,
            fileName: finalFileName,
            fileType: 'file',
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

    await this.operationLogService.logOperation({
      req,
      userId,
      operationType: LogOperationType.UPLOAD,
      resourceType: LogResourceType.FILE,
      resourceId: newFile.id,
      description: `Saved shared file to personal drive: ${finalFileName}`,
    });

    return {
      success: true,
      message: '成功存入您的网盘',
      data: newFile,
    };
  }

  private parseIds(raw: unknown): number[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException('请提供非空的 ids 数组');
    }
    return [
      ...new Set(
        raw
          .map((x) => parseInt(String(x), 10))
          .filter((n) => !Number.isNaN(n) && n > 0),
      ),
    ];
  }

  private async expandTree(
    userId: number,
    initialIds: number[],
    isDeleted: boolean,
  ): Promise<Set<number>> {
    const expanded = new Set<number>(initialIds);
    let changed = true;
    while (changed) {
      changed = false;
      const more = await this.prisma.userFile.findMany({
        where: { userId, isDeleted, parentId: { in: [...expanded] } },
        select: { id: true },
      });
      for (const row of more) {
        if (!expanded.has(row.id)) {
          expanded.add(row.id);
          changed = true;
        }
      }
    }
    return expanded;
  }

  private postOrderDeletionIds(
    nodes: { id: number; parentId: number | null }[],
  ): number[] {
    const idSet = new Set(nodes.map((n) => n.id));
    const children = new Map<number, number[]>();
    const roots: number[] = [];
    for (const n of nodes) {
      const p = n.parentId;
      if (p !== null && idSet.has(p)) {
        const arr = children.get(p) ?? [];
        arr.push(n.id);
        children.set(p, arr);
      } else {
        roots.push(n.id);
      }
    }
    const out: number[] = [];
    const visit = (id: number): void => {
      for (const c of children.get(id) ?? []) visit(c);
      out.push(id);
    };
    for (const r of roots) visit(r);
    return out;
  }

  private preOrderRestoreIds(
    nodes: { id: number; parentId: number | null }[],
  ): number[] {
    const idSet = new Set(nodes.map((n) => n.id));
    const children = new Map<number, number[]>();
    const roots: number[] = [];
    for (const n of nodes) {
      const p = n.parentId;
      if (p !== null && idSet.has(p)) {
        const arr = children.get(p) ?? [];
        arr.push(n.id);
        children.set(p, arr);
      } else {
        roots.push(n.id);
      }
    }
    const out: number[] = [];
    const visit = (id: number): void => {
      out.push(id);
      for (const c of children.get(id) ?? []) visit(c);
    };
    for (const r of roots) visit(r);
    return out;
  }
}
