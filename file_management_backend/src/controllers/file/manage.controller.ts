import { Response } from 'express';
import prisma from '../../lib/prisma.js';
import { AuthRequest } from '../../types/index.js';

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
export const deleteFile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证'
      });
      return;
    }

    const fileId = parseInt(req.params.id);
    
    if (isNaN(fileId)) {
      res.status(400).json({
        success: false,
        message: '无效的文件ID'
      });
      return;
    }

    const userFile = await prisma.userFile.findFirst({
      where: {
        id: fileId,
        userId: req.user.id,
        isDeleted: false
      },
      include: {
        storage: {
          select: {
            id: true,
            filePath: true,
            fileSize: true,
            referenceCount: true
          }
        }
      }
    });

    if (!userFile || !userFile.storage) {
      res.status(404).json({
        success: false,
        message: '文件不存在'
      });
      return;
    }

    // 使用事务处理文件删除
    await prisma.$transaction(async (tx) => {
      // 软删除用户文件记录
      await tx.userFile.update({
        where: { id: fileId },
        data: {
          isDeleted: true,
          deletedAt: new Date()
        }
      });

      // 减少文件存储的引用计数
      const updatedStorage = await tx.fileStorage.update({
        where: { id: userFile.storage!.id },
        data: { referenceCount: { decrement: 1 } }
      });

      // 如果引用计数为0，标记为待删除
      if (updatedStorage.referenceCount <= 0) {
        await tx.fileStorage.update({
          where: { id: userFile.storage!.id },
          data: {
            status: 'pending_delete',
            markedDeleteAt: new Date()
          }
        });
      }

      // 更新用户存储使用量
      await tx.user.update({
        where: { id: req.user!.id },
        data: {
          storageUsed: { decrement: userFile.storage!.fileSize }
        }
      });
    });

    res.json({
      success: true,
      message: '文件删除成功'
    });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      message: '文件删除失败'
    });
  }
};
