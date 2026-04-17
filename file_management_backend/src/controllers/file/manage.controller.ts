import { Response } from 'express';
import prisma from '../../lib/prisma.js';
import { AuthRequest } from '../../types/index.js';
import { logOperation, LogOperationType, LogResourceType } from '../../services/logger.service.js';

/**
 * 创建文件夹
 */
export const createFolder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证'
      });
      return;
    }

    const { name, parentId } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({
        success: false,
        message: '文件夹名称不能为空'
      });
      return;
    }

    // 检查同级目录下是否已存在同名文件夹
    const existingFolder = await prisma.userFile.findFirst({
      where: {
        userId: req.user.id,
        parentId: parentId ? parseInt(parentId) : null,
        fileName: name.trim(),
        isDeleted: false
      }
    });

    if (existingFolder) {
      res.status(400).json({
        success: false,
        message: '文件夹名称已存在'
      });
      return;
    }

    const folder = await prisma.userFile.create({
      data: {
        userId: req.user.id,
        parentId: parentId ? parseInt(parentId) : null,
        fileName: name.trim(),
        fileType: 'folder'
      }
    });


    // 记录日志
    await logOperation({
      req,
      userId: req.user.id,
      operationType: LogOperationType.UPLOAD, // 创建文件夹归类为 Upload 或者单独定义，这里暂时用 Upload 或者新增 CREATE
      resourceType: LogResourceType.FOLDER,
      resourceId: folder.id,
      description: `Created folder: ${folder.fileName}`
    });

    res.status(201).json({
      success: true,
      message: '文件夹创建成功',
      data: {
        id: folder.id,
        fileName: folder.fileName,
        fileType: folder.fileType,
        fileSize: 0,
        mimeType: 'folder',
        createdAt: folder.createdAt
      }
    });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({
      success: false,
      message: '文件夹创建失败'
    });
  }
};

/**
 * 重命名文件/文件夹
 */
export const renameFile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证'
      });
      return;
    }

    const fileId = parseInt(req.params.id);
    const { name } = req.body;

    if (isNaN(fileId) || !name || !name.trim()) {
      res.status(400).json({
        success: false,
        message: '参数无效'
      });
      return;
    }

    // 检查文件是否存在且属于当前用户
    const userFile = await prisma.userFile.findFirst({
      where: {
        id: fileId,
        userId: req.user.id,
        isDeleted: false
      }
    });

    if (!userFile) {
      res.status(404).json({
        success: false,
        message: '文件不存在'
      });
      return;
    }

    // 检查同级目录下是否已存在同名文件
    const existingFile = await prisma.userFile.findFirst({
      where: {
        userId: req.user.id,
        parentId: userFile.parentId,
        fileName: name.trim(),
        isDeleted: false,
        id: { not: fileId }
      }
    });

    if (existingFile) {
      res.status(400).json({
        success: false,
        message: '名称已存在'
      });
      return;
    }

    await prisma.userFile.update({
      where: { id: fileId },
      data: { fileName: name.trim() }
    });



    await logOperation({
      req,
      userId: req.user!.id,
      operationType: LogOperationType.RENAME,
      resourceType: userFile.fileType === 'folder' ? LogResourceType.FOLDER : LogResourceType.FILE,
      resourceId: fileId,
      description: `Renamed ${userFile.fileName} to ${name.trim()}`
    });

    res.json({
      success: true,
      message: '重命名成功'
    });
  } catch (error) {
    console.error('Rename file error:', error);
    res.status(500).json({
      success: false,
      message: '重命名失败'
    });
  }
};

/**
 * 移动文件/文件夹
 */
export const moveFile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证'
      });
      return;
    }

    const fileId = parseInt(req.params.id);
    const { parentId } = req.body;

    if (isNaN(fileId)) {
      res.status(400).json({
        success: false,
        message: '文件ID无效'
      });
      return;
    }

    // 检查文件是否存在且属于当前用户
    const userFile = await prisma.userFile.findFirst({
      where: {
        id: fileId,
        userId: req.user.id,
        isDeleted: false
      }
    });

    if (!userFile) {
      res.status(404).json({
        success: false,
        message: '文件不存在'
      });
      return;
    }

    // 如果指定了父文件夹，检查父文件夹是否存在
    if (parentId) {
      const parentFolder = await prisma.userFile.findFirst({
        where: {
          id: parseInt(parentId),
          userId: req.user.id,
          fileType: 'folder',
          isDeleted: false
        }
      });

      if (!parentFolder) {
        res.status(404).json({
          success: false,
          message: '目标文件夹不存在'
        });
        return;
      }

      // 防止将文件夹移动到自己的子文件夹中
      if (userFile.fileType === 'folder') {
        // 这里应该实现检查是否形成循环引用的逻辑
        // 简化处理，暂时跳过
      }
    }

    await prisma.userFile.update({
      where: { id: fileId },
      data: { parentId: parentId ? parseInt(parentId) : null }
    });



    await logOperation({
      req,
      userId: req.user!.id,
      operationType: LogOperationType.MOVE,
      resourceType: userFile.fileType === 'folder' ? LogResourceType.FOLDER : LogResourceType.FILE,
      resourceId: fileId,
      description: `Moved ${userFile.fileName} to parentId: ${parentId || 'root'}`
    });

    res.json({
      success: true,
      message: '移动成功'
    });
  } catch (error) {
    console.error('Move file error:', error);
    res.status(500).json({
      success: false,
      message: '移动失败'
    });
  }
};

/**
 * 删除文件
 */

/**
 * 删除文件（移入回收站）
 */
export const deleteFile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const fileId = parseInt(req.params.id);
    if (isNaN(fileId)) {
      res.status(400).json({ success: false, message: '无效的文件ID' });
      return;
    }

    const userFile = await prisma.userFile.findFirst({
      where: {
        id: fileId,
        userId: req.user.id,
        isDeleted: false
      }
    });

    if (!userFile) {
      res.status(404).json({ success: false, message: '文件不存在' });
      return;
    }

    // 软删除用户文件记录
    await prisma.userFile.update({
      where: { id: fileId },
      data: {
        isDeleted: true,
        deletedAt: new Date()
      }
    });



    await logOperation({
      req,
      userId: req.user!.id,
      operationType: LogOperationType.DELETE,
      resourceType: userFile.fileType === 'folder' ? LogResourceType.FOLDER : LogResourceType.FILE,
      resourceId: fileId,
      description: `Moved to recycle bin: ${userFile.fileName}`
    });

    res.json({
      success: true,
      message: '文件已移入回收站'
    });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ success: false, message: '文件删除失败' });
  }
};

/**
 * 还原文件
 */
export const restoreFile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const fileId = parseInt(req.params.id);
    if (isNaN(fileId)) {
      res.status(400).json({ success: false, message: '无效的文件ID' });
      return;
    }

    const userFile = await prisma.userFile.findFirst({
      where: {
        id: fileId,
        userId: req.user.id,
        isDeleted: true
      }
    });

    if (!userFile) {
      res.status(404).json({ success: false, message: '回收站中找不到该文件' });
      return;
    }

    // 检查父文件夹状态
    let newParentId = userFile.parentId;
    let restoreToRoot = false;

    if (newParentId) {
      const parentFolder = await prisma.userFile.findFirst({
        where: {
          id: newParentId,
          userId: req.user.id
        }
      });

      // 如果父文件夹不存在，或者父文件夹也在回收站中
      if (!parentFolder || parentFolder.isDeleted) {
        newParentId = null; // 还原到根目录
        restoreToRoot = true;
      }
    }

    // 还原文件
    await prisma.userFile.update({
      where: { id: fileId },
      data: {
        isDeleted: false,
        deletedAt: null,
        parentId: newParentId // 更新父目录ID（可能变为根目录）
      }
    });



    await logOperation({
      req,
      userId: req.user!.id,
      operationType: LogOperationType.RESTORE,
      resourceType: userFile.fileType === 'folder' ? LogResourceType.FOLDER : LogResourceType.FILE,
      resourceId: fileId,
      description: `Restored file: ${userFile.fileName}${restoreToRoot ? ' (to root)' : ''}`
    });

    res.json({
      success: true,
      message: restoreToRoot
        ? '原文件夹不存在或已删除，文件已还原到根目录'
        : '文件已还原'
    });
  } catch (error) {
    console.error('Restore file error:', error);
    res.status(500).json({ success: false, message: '文件还原失败' });
  }
};

/**
 * 彻底删除文件
 */
export const permanentDeleteFile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const fileId = parseInt(req.params.id);
    if (isNaN(fileId)) {
      res.status(400).json({ success: false, message: '无效的文件ID' });
      return;
    }

    const userFile = await prisma.userFile.findFirst({
      where: {
        id: fileId,
        userId: req.user.id,
        isDeleted: true
      },
      include: {
        storage: {
          select: {
            id: true,
            fileSize: true,
            filePath: true // 需要路径来判断是否物理删除（虽然这里只减引用）
          }
        }
      }
    });

    if (!userFile) {
      res.status(404).json({ success: false, message: '回收站中找不到该文件' });
      return;
    }

    // 仅当文件有对应的存储记录时（文件夹可能没有）才处理存储
    const fileSize = userFile.storage ? userFile.storage.fileSize : BigInt(0);
    const storageId = userFile.storageId;

    await prisma.$transaction(async (tx) => {
      // 1. 彻底删除用户文件记录
      await tx.userFile.delete({
        where: { id: fileId }
      });

      // 2. 如果关联了存储文件，处理引用计数和用户已用空间
      if (storageId && userFile.storage) {
        // 更新用户存储使用量 (彻底删除才释放空间)
        await tx.user.update({
          where: { id: req.user!.id },
          data: {
            storageUsed: { decrement: fileSize }
          }
        });

        // 减少文件存储的引用计数
        const updatedStorage = await tx.fileStorage.update({
          where: { id: storageId },
          data: { referenceCount: { decrement: 1 } }
        });

        // 3. 如果引用计数<=0，标记物理删除
        if (updatedStorage.referenceCount <= 0) {
          await tx.fileStorage.update({
            where: { id: storageId },
            data: {
              status: 'pending_delete',
              markedDeleteAt: new Date()
            }
          });
          // 注意：物理删除通常由定时任务清理，或者在这里同步删除。为了性能通常是异步清理。
          // 这里仅仅更新了状态。后续需要有 Cron Job 来清理 pending_delete 的文件。
        }
      }
    });



    // 彻底删除后记录日志（注意：此时 userFile 记录可以作为快照信息使用，尽管数据已删）
    await logOperation({
      req,
      userId: req.user!.id,
      operationType: LogOperationType.PERMANENT_DELETE,
      resourceType: userFile.fileType === 'folder' ? LogResourceType.FOLDER : LogResourceType.FILE,
      resourceId: fileId,
      description: `Permanently deleted: ${userFile.fileName}`
    });

    res.json({
      success: true,
      message: '文件已彻底删除'
    });
  } catch (error) {
    console.error('Permanent delete file error:', error);
    res.status(500).json({ success: false, message: '彻底删除失败' });
  }
};

const MAX_BATCH_PERMANENT_DELETE = 2000;
const MAX_BATCH_PERMANENT_DELETE_EXPANDED = 10000;

/** 在同一批删除集合内，子项先于父项（避免删文件夹时级联删掉子行导致存储未扣减） */
function postOrderDeletionIds(nodes: { id: number; parentId: number | null }[]): number[] {
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
    for (const c of children.get(id) ?? []) {
      visit(c);
    }
    out.push(id);
  };
  for (const r of roots) {
    visit(r);
  }
  return out;
}

/** 同一批还原集合内：父先于子，保证父目录先恢复后再恢复子项 */
function preOrderRestoreIds(nodes: { id: number; parentId: number | null }[]): number[] {
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
    for (const c of children.get(id) ?? []) {
      visit(c);
    }
  };
  for (const r of roots) {
    visit(r);
  }
  return out;
}

/**
 * 批量还原（回收站）
 * 自动纳入回收站内所选节点的所有子孙项，并按父→子顺序还原（与单条 restore 逻辑一致）。
 */
export const restoreFilesBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const raw = req.body?.ids;
    if (!Array.isArray(raw) || raw.length === 0) {
      res.status(400).json({ success: false, message: '请提供非空的 ids 数组' });
      return;
    }

    const uniqueIds = [...new Set(raw.map((x: unknown) => parseInt(String(x), 10)).filter((n) => !isNaN(n)))];
    if (uniqueIds.length === 0) {
      res.status(400).json({ success: false, message: '无效的文件 ID' });
      return;
    }
    if (uniqueIds.length > MAX_BATCH_PERMANENT_DELETE) {
      res.status(400).json({
        success: false,
        message: `单次最多还原 ${MAX_BATCH_PERMANENT_DELETE} 项`
      });
      return;
    }

    const userId = req.user.id;

    const initialRows = await prisma.userFile.findMany({
      where: {
        id: { in: uniqueIds },
        userId,
        isDeleted: true
      },
      select: { id: true }
    });
    if (initialRows.length !== uniqueIds.length) {
      res.status(400).json({ success: false, message: '部分文件不存在或不在回收站' });
      return;
    }

    let expanded = new Set<number>(uniqueIds);
    let changed = true;
    while (changed) {
      changed = false;
      const more = await prisma.userFile.findMany({
        where: {
          userId,
          isDeleted: true,
          parentId: { in: [...expanded] }
        },
        select: { id: true }
      });
      for (const row of more) {
        if (!expanded.has(row.id)) {
          expanded.add(row.id);
          changed = true;
        }
      }
    }

    if (expanded.size > MAX_BATCH_PERMANENT_DELETE_EXPANDED) {
      res.status(400).json({
        success: false,
        message: `展开子项后数量超过上限（${MAX_BATCH_PERMANENT_DELETE_EXPANDED}）`
      });
      return;
    }

    const allNodes = await prisma.userFile.findMany({
      where: {
        id: { in: [...expanded] },
        userId,
        isDeleted: true
      },
      select: {
        id: true,
        parentId: true,
        fileName: true,
        fileType: true
      }
    });

    if (allNodes.length !== expanded.size) {
      res.status(400).json({ success: false, message: '批量还原数据不一致，请重试' });
      return;
    }

    const snapshot = new Map<number, { fileName: string; fileType: string }>(
      allNodes.map((uf) => [uf.id, { fileName: uf.fileName, fileType: uf.fileType }])
    );

    const order = preOrderRestoreIds(allNodes.map((n) => ({ id: n.id, parentId: n.parentId })));

    const restoredIds: number[] = [];

    await prisma.$transaction(async (tx) => {
      for (const fileId of order) {
        const userFile = await tx.userFile.findFirst({
          where: {
            id: fileId,
            userId,
            isDeleted: true
          }
        });

        if (!userFile) {
          continue;
        }

        let newParentId = userFile.parentId;

        if (newParentId) {
          const parentFolder = await tx.userFile.findFirst({
            where: {
              id: newParentId,
              userId
            }
          });

          if (!parentFolder || parentFolder.isDeleted) {
            newParentId = null;
          }
        }

        await tx.userFile.update({
          where: { id: fileId },
          data: {
            isDeleted: false,
            deletedAt: null,
            parentId: newParentId
          }
        });
        restoredIds.push(fileId);
      }
    });

    const restoredCount = restoredIds.length;

    for (const fileId of restoredIds) {
      const meta = snapshot.get(fileId);
      if (!meta) continue;
      await logOperation({
        req,
        userId,
        operationType: LogOperationType.RESTORE,
        resourceType: meta.fileType === 'folder' ? LogResourceType.FOLDER : LogResourceType.FILE,
        resourceId: fileId,
        description: `Restored file (batch): ${meta.fileName}`
      });
    }

    res.json({
      success: true,
      message: `已还原 ${restoredCount} 项`,
      data: { restoredCount }
    });
  } catch (error) {
    console.error('Restore batch error:', error);
    res.status(500).json({ success: false, message: '批量还原失败' });
  }
};

/**
 * 批量彻底删除（回收站）
 * 会自动包含所选节点在回收站内的所有子孙项，并按子→父顺序删除。
 */
export const permanentDeleteFilesBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const raw = req.body?.ids;
    if (!Array.isArray(raw) || raw.length === 0) {
      res.status(400).json({ success: false, message: '请提供非空的 ids 数组' });
      return;
    }

    const uniqueIds = [...new Set(raw.map((x: unknown) => parseInt(String(x), 10)).filter((n) => !isNaN(n)))];
    if (uniqueIds.length === 0) {
      res.status(400).json({ success: false, message: '无效的文件 ID' });
      return;
    }
    if (uniqueIds.length > MAX_BATCH_PERMANENT_DELETE) {
      res.status(400).json({
        success: false,
        message: `单次最多删除 ${MAX_BATCH_PERMANENT_DELETE} 项`
      });
      return;
    }

    const userId = req.user.id;

    const initialRows = await prisma.userFile.findMany({
      where: {
        id: { in: uniqueIds },
        userId,
        isDeleted: true
      },
      select: { id: true }
    });
    if (initialRows.length !== uniqueIds.length) {
      res.status(400).json({ success: false, message: '部分文件不存在或不在回收站' });
      return;
    }

    let expanded = new Set<number>(uniqueIds);
    let changed = true;
    while (changed) {
      changed = false;
      const more = await prisma.userFile.findMany({
        where: {
          userId,
          isDeleted: true,
          parentId: { in: [...expanded] }
        },
        select: { id: true }
      });
      for (const row of more) {
        if (!expanded.has(row.id)) {
          expanded.add(row.id);
          changed = true;
        }
      }
    }

    if (expanded.size > MAX_BATCH_PERMANENT_DELETE_EXPANDED) {
      res.status(400).json({
        success: false,
        message: `展开子项后数量超过上限（${MAX_BATCH_PERMANENT_DELETE_EXPANDED}）`
      });
      return;
    }

    const allNodes = await prisma.userFile.findMany({
      where: {
        id: { in: [...expanded] },
        userId,
        isDeleted: true
      },
      include: {
        storage: {
          select: {
            id: true,
            fileSize: true,
            filePath: true
          }
        }
      }
    });

    if (allNodes.length !== expanded.size) {
      res.status(400).json({ success: false, message: '批量删除数据不一致，请重试' });
      return;
    }

    const snapshot = new Map<
      number,
      { fileName: string; fileType: string }
    >(allNodes.map((uf) => [uf.id, { fileName: uf.fileName, fileType: uf.fileType }]));

    const order = postOrderDeletionIds(
      allNodes.map((n) => ({ id: n.id, parentId: n.parentId }))
    );

    const deletedIds: number[] = [];

    await prisma.$transaction(async (tx) => {
      for (const fileId of order) {
        const userFile = await tx.userFile.findFirst({
          where: {
            id: fileId,
            userId,
            isDeleted: true
          },
          include: {
            storage: {
              select: {
                id: true,
                fileSize: true,
                filePath: true
              }
            }
          }
        });

        if (!userFile) {
          continue;
        }

        const fileSize = userFile.storage ? userFile.storage.fileSize : BigInt(0);
        const storageId = userFile.storageId;

        await tx.userFile.delete({
          where: { id: fileId }
        });
        deletedIds.push(fileId);

        if (storageId && userFile.storage) {
          await tx.user.update({
            where: { id: userId },
            data: {
              storageUsed: { decrement: fileSize }
            }
          });

          const updatedStorage = await tx.fileStorage.update({
            where: { id: storageId },
            data: { referenceCount: { decrement: 1 } }
          });

          if (updatedStorage.referenceCount <= 0) {
            await tx.fileStorage.update({
              where: { id: storageId },
              data: {
                status: 'pending_delete',
                markedDeleteAt: new Date()
              }
            });
          }
        }
      }
    });

    const deletedCount = deletedIds.length;

    for (const fileId of deletedIds) {
      const meta = snapshot.get(fileId);
      if (!meta) continue;
      await logOperation({
        req,
        userId,
        operationType: LogOperationType.PERMANENT_DELETE,
        resourceType: meta.fileType === 'folder' ? LogResourceType.FOLDER : LogResourceType.FILE,
        resourceId: fileId,
        description: `Permanently deleted (batch): ${meta.fileName}`
      });
    }

    res.json({
      success: true,
      message: `已彻底删除 ${deletedCount} 项`,
      data: { deletedCount }
    });
  } catch (error) {
    console.error('Permanent delete batch error:', error);
    res.status(500).json({ success: false, message: '批量彻底删除失败' });
  }
};

/**
 * 保存分享的文件到自己的网盘
 */
export const saveSharedFile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const sourceFileId = parseInt(req.params.id);
    const { parentId } = req.body;

    if (isNaN(sourceFileId)) {
      res.status(400).json({ success: false, message: '无效的文件ID' });
      return;
    }

    // 查找源文件资料
    const sourceFile = await prisma.userFile.findFirst({
      where: {
        id: sourceFileId,
        isDeleted: false,
        fileType: 'file'
      },
      include: {
        storage: true
      }
    });

    if (!sourceFile || !sourceFile.storageId || !sourceFile.storage) {
      res.status(404).json({ success: false, message: '共享的原文件不存在或已删除' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      res.status(404).json({ success: false, message: '当前用户不存在' });
      return;
    }

    const fileSize = sourceFile.storage.fileSize;
    if (user.storageUsed + fileSize > user.storageQuota) {
      res.status(400).json({ success: false, message: '您的存储空间不足，无法保存' });
      return;
    }

    if (parentId) {
      const targetFolder = await prisma.userFile.findFirst({
        where: {
          id: parseInt(parentId),
          userId: req.user.id,
          fileType: 'folder',
          isDeleted: false
        }
      });
      if (!targetFolder) {
        res.status(404).json({ success: false, message: '目标存放文件夹不存在' });
        return;
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

    // 检查是否有重名文件并加后缀
    while (true) {
      const exists = await prisma.userFile.findFirst({
        where: {
          userId: req.user.id,
          parentId: parentId ? parseInt(parentId) : null,
          fileName: finalFileName,
          isDeleted: false
        }
      });
      if (!exists) break;
      finalFileName = `${baseName}(${counter})${ext}`;
      counter++;
    }

    const newFile = await prisma.$transaction(async (tx) => {
      // 更新用户容量
      await tx.user.update({
        where: { id: req.user!.id },
        data: { storageUsed: { increment: fileSize } }
      });

      // 更新源文件存储引用
      await tx.fileStorage.update({
        where: { id: sourceFile.storageId! },
        data: { referenceCount: { increment: 1 } }
      });

      // 创建新的UserFile指向同一个资源
      return await tx.userFile.create({
        data: {
          userId: req.user!.id,
          storageId: sourceFile.storageId,
          parentId: parentId ? parseInt(parentId) : null,
          fileName: finalFileName,
          fileType: 'file'
        }
      });
    });

    await logOperation({
      req,
      userId: req.user.id,
      operationType: LogOperationType.UPLOAD,
      resourceType: LogResourceType.FILE,
      resourceId: newFile.id,
      description: `Saved shared file to personal drive: ${finalFileName}`
    });

    res.json({
      success: true,
      message: '成功存入您的网盘',
      data: newFile
    });
  } catch (error) {
    console.error('Save shared file error:', error);
    res.status(500).json({ success: false, message: '保存文件时服务器发生错误' });
  }
};
