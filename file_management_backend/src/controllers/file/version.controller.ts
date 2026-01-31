import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../../lib/prisma.js';
import { AuthRequest } from '../../types/index.js';
import { logOperation, LogOperationType, LogResourceType } from '../../services/logger.service.js';

/**
 * 获取文件历史版本列表
 * GET /api/files/:id/versions
 */
export const getFileVersions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // 检查文件所有权
    const userFile = await prisma.userFile.findFirst({
      where: {
        id: parseInt(id),
        userId,
        isDeleted: false
      }
    });

    if (!userFile) {
      res.status(404).json({
        success: false,
        message: '文件不存在或无权访问'
      });
      return;
    }

    // 查询历史版本
    const versions = await (prisma as any).fileHistory.findMany({
      where: {
        userFileId: parseInt(id)
      },
      orderBy: {
        version: 'desc'
      },
      include: {
        // storage: true // 如果需要更多storage信息
      }
    });

    // 格式化返回
    const data = versions.map((v: any) => ({
      id: v.id,
      version: v.version,
      fileName: v.fileName,
      fileSize: Number(v.fileSize),
      createdAt: v.createdAt
    }));

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get versions error:', error);
    res.status(500).json({
      success: false,
      message: '获取版本列表失败'
    });
  }
};

/**
 * 回滚到指定版本
 * POST /api/files/:id/versions/:versionId/rollback
 */
export const rollbackVersion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id, versionId } = req.params;
    const userId = req.user!.id;

    // 使用事务处理回滚
    const result = await prisma.$transaction(async (tx: any) => {
      // 1. 获取主文件
      const userFile = await tx.userFile.findFirst({
        where: { id: parseInt(id), userId, isDeleted: false },
        include: { storage: true }
      });

      if (!userFile) {
        throw new Error('FILE_NOT_FOUND');
      }

      // 2. 获取目标历史版本
      const targetVersion = await tx.fileHistory.findFirst({
        where: { id: parseInt(versionId), userFileId: parseInt(id) }
      });

      if (!targetVersion) {
        throw new Error('VERSION_NOT_FOUND');
      }

      // 3. 归档当前版本 (Save current state to history before overwriting)
      if (userFile.storage) {
        await tx.fileHistory.create({
          data: {
            userFileId: userFile.id,
            storageId: userFile.storageId!,
            fileName: userFile.fileName,
            version: userFile.version,
            fileSize: userFile.storage.fileSize
          }
        });
      }

      // 4. 更新主文件为目标版本
      // 注意：版本号 +1，而不是变成旧版本号，以保持线性历史
      const updatedFile = await tx.userFile.update({
        where: { id: userFile.id },
        data: {
          storageId: targetVersion.storageId,
          version: { increment: 1 },
          updatedAt: new Date()
        }
      });
      
      // 增加目标storage的引用计数
      await tx.fileStorage.update({
          where: { id: targetVersion.storageId },
          data: { referenceCount: { increment: 1 }}
      });

      // 5. 更新 quota (Logical quota increases by the size of the restored file)
      await tx.user.update({
        where: { id: userId },
        data: {
          storageUsed: { increment: targetVersion.fileSize }
        }
      });

      return updatedFile;
    });

    // 记录日志
    await logOperation({
      req,
      userId,
      operationType: LogOperationType.VERSION_ROLLBACK, // or ROLLBACK if exists
      resourceType: LogResourceType.FILE,
      resourceId: result.id,
      description: `Rolled back file ${result.fileName} to version`
    });

    res.json({
      success: true,
      message: '回滚成功',
      data: {
          version: result.version
      }
    });

  } catch (error: any) {
    console.error('Rollback error:', error);
    if (error.message === 'FILE_NOT_FOUND') {
       res.status(404).json({ success: false, message: '文件不存在' });
    } else if (error.message === 'VERSION_NOT_FOUND') {
       res.status(404).json({ success: false, message: '版本不存在' });
    } else {
       res.status(500).json({ success: false, message: '回滚失败' });
    }
  }
};

/**
 * 下载/预览历史版本文件
 * GET /api/files/:id/versions/:versionId/download
 */
export const downloadVersion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id, versionId } = req.params;
    const userId = req.user!.id;

    // 1. 检查文件所有权
    const userFile = await prisma.userFile.findFirst({
      where: { id: parseInt(id), userId, isDeleted: false }
    });

    if (!userFile) {
      res.status(404).json({ success: false, message: '文件不存在或无权访问' });
      return;
    }

    // 2. 获取历史版本信息
    const version = await (prisma as any).fileHistory.findFirst({
      where: {
        id: parseInt(versionId),
        userFileId: parseInt(id)
      },
      include: {
        storage: {
            select: {
                filePath: true,
                mimeType: true
            }
        }
      }
    });

    if (!version || !version.storage) {
        res.status(404).json({ success: false, message: '版本文件不存在' });
        return;
    }

    // 3. 检查物理文件
    if (!fs.existsSync(version.storage.filePath)) {
        res.status(404).json({ success: false, message: '物理文件已丢失' });
        return;
    }

    // 4. 设置响应头
    const isPreview = req.query.preview === 'true';
    const disposition = isPreview ? 'inline' : 'attachment';
    
    // MimeType logic
    let contentType = version.storage.mimeType || 'application/octet-stream';
    const ext = path.extname(version.fileName).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'video/ogg',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.wmv': 'video/x-ms-wmv',
      '.flv': 'video/x-flv',
      '.mkv': 'video/x-matroska',
      '.rmvb': 'application/vnd.rn-realmedia',
      '.rm': 'application/vnd.rn-realmedia'
    };
    if (mimeMap[ext]) {
      contentType = mimeMap[ext];
    }
    
    if (isPreview && (contentType.startsWith('text/') || ext === '.txt' || ext === '.md' || ext === '.json' || ext === '.js' || ext === '.css' || ext === '.html')) {
        if (!contentType.includes('charset')) {
            contentType += '; charset=utf-8';
        }
    }

    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(version.fileName)}"`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');

    res.sendFile(path.resolve(version.storage.filePath));

  } catch (error) {
    console.error('Download version error:', error);
    res.status(500).json({ success: false, message: '下载失败' });
  }
};
