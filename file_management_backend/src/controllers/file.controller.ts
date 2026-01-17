import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { AuthRequest } from '../types/index.js';

/**
 * 计算文件 MD5 哈希
 */
const calculateFileHash = (filePath: string): string => {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(fileBuffer).digest('hex');
};

/**
 * 上传文件
 */
export const uploadFile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        message: '请选择要上传的文件'
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证'
      });
      return;
    }

    // 计算文件哈希
    const fileHash = calculateFileHash(req.file.path);
    
    // 使用事务处理文件上传
    const result = await prisma.$transaction(async (tx) => {
      // 检查文件是否已存在（去重）
      let fileStorage = await tx.fileStorage.findUnique({
        where: { fileHash }
      });

      // 如果文件不存在，创建新的存储记录
      if (!fileStorage) {
        fileStorage = await tx.fileStorage.create({
          data: {
            fileHash,
            filePath: req.file!.path,
            fileSize: BigInt(req.file!.size),
            mimeType: req.file!.mimetype,
            referenceCount: 1,
            status: 'active'
          }
        });
      } else {
        // 文件已存在，增加引用计数
        fileStorage = await tx.fileStorage.update({
          where: { id: fileStorage.id },
          data: { referenceCount: { increment: 1 } }
        });
        
        // 删除重复的物理文件
        if (fs.existsSync(req.file!.path)) {
          fs.unlinkSync(req.file!.path);
        }
      }

      // 创建用户文件记录
      const userFile = await tx.userFile.create({
        data: {
          userId: req.user!.id,
          storageId: fileStorage.id,
          fileName: req.file!.originalname,
          fileType: 'file'
        }
      });

      // 更新用户存储使用量
      await tx.user.update({
        where: { id: req.user!.id },
        data: {
          storageUsed: { increment: BigInt(req.file!.size) }
        }
      });

      return { userFile, fileStorage };
    });

    res.status(201).json({
      success: true,
      message: '文件上传成功',
      data: {
        id: result.userFile.id,
        fileName: result.userFile.fileName,
        fileSize: Number(result.fileStorage.fileSize),
        mimeType: result.fileStorage.mimeType,
        createdAt: result.userFile.createdAt
      }
    });
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({
      success: false,
      message: '文件上传失败'
    });
  }
};

/**
 * 获取文件列表
 */
export const getFiles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证'
      });
      return;
    }

    // 获取当前用户的文件列表
    const userFiles = await prisma.userFile.findMany({
      where: { 
        userId: req.user.id,
        isDeleted: false
      },
      include: {
        storage: {
          select: {
            fileSize: true,
            mimeType: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const files = userFiles.map(file => ({
      id: file.id,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.storage ? Number(file.storage.fileSize) : 0,
      mimeType: file.storage?.mimeType || 'unknown',
      createdAt: file.createdAt,
      updatedAt: file.updatedAt
    }));

    res.json({
      success: true,
      data: files,
      total: files.length
    });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({
      success: false,
      message: '获取文件列表失败'
    });
  }
};

/**
 * 获取单个文件信息
 */
export const getFileById = async (req: AuthRequest, res: Response): Promise<void> => {
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
            fileSize: true,
            mimeType: true
          }
        }
      }
    });

    if (!userFile) {
      res.status(404).json({
        success: false,
        message: '文件不存在'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: userFile.id,
        fileName: userFile.fileName,
        fileType: userFile.fileType,
        fileSize: userFile.storage ? Number(userFile.storage.fileSize) : 0,
        mimeType: userFile.storage?.mimeType || 'unknown',
        createdAt: userFile.createdAt,
        updatedAt: userFile.updatedAt
      }
    });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({
      success: false,
      message: '获取文件信息失败'
    });
  }
};

/**
 * 下载文件
 */
export const downloadFile = async (req: AuthRequest, res: Response): Promise<void> => {
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
            filePath: true,
            mimeType: true
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

    // 检查物理文件是否存在
    if (!fs.existsSync(userFile.storage.filePath)) {
      res.status(404).json({
        success: false,
        message: '文件已被删除'
      });
      return;
    }

    // 设置响应头
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(userFile.fileName)}"`);
    res.setHeader('Content-Type', userFile.storage.mimeType);

    // 发送文件
    res.sendFile(path.resolve(userFile.storage.filePath));
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({
      success: false,
      message: '文件下载失败'
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
