import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
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
 * 确保目录存在
 */
const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/**
 * 检查文件是否存在（秒传检测）
 */
export const checkFileExists = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { fileHash } = req.body;

    if (!fileHash) {
      res.status(400).json({
        success: false,
        message: '文件哈希值不能为空'
      });
      return;
    }

    // 查找是否存在相同哈希的文件
    const existingFile = await prisma.fileStorage.findUnique({
      where: { fileHash, status: 'active' }
    });

    if (existingFile) {
      res.json({
        success: true,
        data: {
          exists: true,
          fileInfo: {
            fileSize: Number(existingFile.fileSize),
            mimeType: existingFile.mimeType
          }
        }
      });
    } else {
      res.json({
        success: true,
        data: { exists: false }
      });
    }
  } catch (error) {
    console.error('Check file exists error:', error);
    res.status(500).json({
      success: false,
      message: '检查文件失败'
    });
  }
};

/**
 * 上传分片
 */
export const uploadChunk = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file || !req.user) {
      res.status(400).json({
        success: false,
        message: '分片文件或用户信息缺失'
      });
      return;
    }

    const { fileHash, chunkIndex, chunkHash } = req.body;

    if (!fileHash || chunkIndex === undefined || !chunkHash) {
      res.status(400).json({
        success: false,
        message: '分片信息不完整'
      });
      return;
    }

    // 创建分片存储目录
    const chunksDir = path.join(process.cwd(), 'chunks', fileHash);
    ensureDirectoryExists(chunksDir);

    // 移动分片文件到指定目录
    const chunkPath = path.join(chunksDir, `chunk-${chunkIndex}`);
    fs.renameSync(req.file.path, chunkPath);

    // 记录分片信息
    await prisma.uploadChunk.upsert({
      where: {
        fileHash_chunkIndex: {
          fileHash,
          chunkIndex: parseInt(chunkIndex)
        }
      },
      update: {
        chunkHash,
        chunkSize: req.file.size,
        chunkPath,
        status: 'completed'
      },
      create: {
        userId: req.user.id,
        fileHash,
        chunkIndex: parseInt(chunkIndex),
        chunkHash,
        chunkSize: req.file.size,
        chunkPath,
        status: 'completed'
      }
    });

    res.json({
      success: true,
      message: '分片上传成功'
    });
  } catch (error) {
    console.error('Upload chunk error:', error);
    res.status(500).json({
      success: false,
      message: '分片上传失败'
    });
  }
};

/**
 * 获取已上传的分片列表
 */
export const getUploadedChunks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证'
      });
      return;
    }

    const { fileHash } = req.params;

    const uploadedChunks = await prisma.uploadChunk.findMany({
      where: {
        fileHash,
        userId: req.user.id,
        status: 'completed'
      },
      select: { chunkIndex: true },
      orderBy: { chunkIndex: 'asc' }
    });

    res.json({
      success: true,
      data: uploadedChunks.map(chunk => chunk.chunkIndex)
    });
  } catch (error) {
    console.error('Get uploaded chunks error:', error);
    res.status(500).json({
      success: false,
      message: '获取分片列表失败'
    });
  }
};

/**
 * 合并分片
 */
export const mergeChunks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证'
      });
      return;
    }

    const { fileHash, fileName, fileSize, mimeType, totalChunks, parentId } = req.body;

    console.log('Merge chunks request body:', req.body);
    console.log('Parameters:', { fileHash, fileName, fileSize, mimeType, totalChunks, parentId });

    if (!fileHash || !fileName || fileSize === undefined || fileSize === null || !mimeType || totalChunks === undefined || totalChunks === null) {
      console.log('Missing parameters:', {
        fileHash: !!fileHash,
        fileName: !!fileName,
        fileSize: fileSize !== undefined && fileSize !== null,
        mimeType: !!mimeType,
        totalChunks: totalChunks !== undefined && totalChunks !== null
      });
      res.status(400).json({
        success: false,
        message: '合并参数不完整'
      });
      return;
    }

    // 使用事务创建文件记录
    let finalFilePath: string;
    
    // 检查所有分片是否都已上传（空文件跳过此检查）
    if (totalChunks > 0) {
      const uploadedChunks = await prisma.uploadChunk.findMany({
        where: {
          fileHash,
          userId: req.user.id,
          status: 'completed'
        },
        orderBy: { chunkIndex: 'asc' }
      });

      if (uploadedChunks.length !== totalChunks) {
        res.status(400).json({
          success: false,
          message: '分片不完整，无法合并'
        });
        return;
      }

      // 创建最终文件存储目录
      const uploadsDir = path.join(process.cwd(), 'uploads');
      ensureDirectoryExists(uploadsDir);

      finalFilePath = path.join(uploadsDir, `${fileHash}-${fileName}`);
      const writeStream = fs.createWriteStream(finalFilePath);

      // 按顺序合并分片
      for (const chunk of uploadedChunks) {
        const chunkData = fs.readFileSync(chunk.chunkPath);
        writeStream.write(chunkData);
      }
      writeStream.end();

      // 等待写入完成
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
      });

      // 验证合并后的文件哈希
      const mergedFileHash = calculateFileHash(finalFilePath);
      if (mergedFileHash !== fileHash) {
        // 删除错误的文件
        fs.unlinkSync(finalFilePath);
        res.status(400).json({
          success: false,
          message: '文件合并失败，哈希值不匹配'
        });
        return;
      }
    } else {
      // 空文件处理：直接创建空文件
      const uploadsDir = path.join(process.cwd(), 'uploads');
      ensureDirectoryExists(uploadsDir);
      finalFilePath = path.join(uploadsDir, `${fileHash}-${fileName}`);
      fs.writeFileSync(finalFilePath, ''); // 创建空文件
    }

    // 使用事务创建文件记录
    const result = await prisma.$transaction(async (tx) => {
      // 创建物理文件记录
      const fileStorage = await tx.fileStorage.create({
        data: {
          fileHash,
          filePath: finalFilePath,
          fileSize: BigInt(fileSize),
          mimeType,
          referenceCount: 1,
          status: 'active'
        }
      });

      // 创建用户文件记录
      const userFile = await tx.userFile.create({
        data: {
          userId: req.user!.id,
          storageId: fileStorage.id,
          parentId: parentId ? parseInt(parentId) : null,
          fileName,
          fileType: 'file'
        }
      });

      // 更新用户存储使用量
      await tx.user.update({
        where: { id: req.user!.id },
        data: {
          storageUsed: { increment: BigInt(fileSize) }
        }
      });

      return { userFile, fileStorage };
    });

    // 清理分片文件和记录（仅对非空文件）
    if (totalChunks > 0) {
      const chunksDir = path.join(process.cwd(), 'chunks', fileHash);
      if (fs.existsSync(chunksDir)) {
        fs.rmSync(chunksDir, { recursive: true, force: true });
      }

      await prisma.uploadChunk.deleteMany({
        where: {
          fileHash,
          userId: req.user.id
        }
      });
    }

    res.status(201).json({
      success: true,
      message: '文件上传成功',
      data: {
        id: result.userFile.id,
        fileName: result.userFile.fileName,
        fileSize: Number(result.fileStorage.fileSize),
        mimeType: result.fileStorage.mimeType,
        fileType: result.userFile.fileType,
        createdAt: result.userFile.createdAt
      }
    });
  } catch (error) {
    console.error('Merge chunks error:', error);
    res.status(500).json({
      success: false,
      message: '文件合并失败'
    });
  }
};

/**
 * 秒传文件
 */
export const instantUpload = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证'
      });
      return;
    }

    const { fileHash, fileName, fileSize, mimeType, parentId } = req.body;

    if (!fileHash || !fileName || fileSize === undefined || fileSize === null || !mimeType) {
      res.status(400).json({
        success: false,
        message: '秒传参数不完整'
      });
      return;
    }

    // 查找已存在的文件
    const existingFile = await prisma.fileStorage.findUnique({
      where: { fileHash, status: 'active' }
    });

    if (!existingFile) {
      res.status(404).json({
        success: false,
        message: '文件不存在，无法秒传'
      });
      return;
    }

    // 使用事务创建用户文件引用
    const result = await prisma.$transaction(async (tx) => {
      // 增加引用计数
      await tx.fileStorage.update({
        where: { id: existingFile.id },
        data: { referenceCount: { increment: 1 } }
      });

      // 创建用户文件记录
      const userFile = await tx.userFile.create({
        data: {
          userId: req.user!.id,
          storageId: existingFile.id,
          parentId: parentId ? parseInt(parentId) : null,
          fileName,
          fileType: 'file'
        }
      });

      // 更新用户存储使用量
      await tx.user.update({
        where: { id: req.user!.id },
        data: {
          storageUsed: { increment: BigInt(fileSize) }
        }
      });

      return userFile;
    });

    res.status(201).json({
      success: true,
      message: '文件秒传成功',
      data: {
        id: result.id,
        fileName: result.fileName,
        fileSize: Number(existingFile.fileSize),
        mimeType: existingFile.mimeType,
        fileType: result.fileType,
        createdAt: result.createdAt
      }
    });
  } catch (error) {
    console.error('Instant upload error:', error);
    res.status(500).json({
      success: false,
      message: '秒传失败'
    });
  }
};

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
 * 上传文件（传统方式，保留兼容性）
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

    const { parentId } = req.query;

    // 获取当前用户的文件列表
    const userFiles = await prisma.userFile.findMany({
      where: { 
        userId: req.user.id,
        parentId: parentId ? parseInt(parentId as string) : null,
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
      orderBy: [
        { fileType: 'desc' }, // 'folder' > 'file', so desc puts folder first
        { createdAt: 'desc' }
      ]
    });

    const files = userFiles.map(file => ({
      id: file.id,
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.storage ? Number(file.storage.fileSize) : 0,
      mimeType: file.storage?.mimeType || (file.fileType === 'folder' ? 'folder' : 'unknown'),
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

/**
 * 获取文件缩略图
 */
export const getFileThumbnail = async (req: AuthRequest, res: Response): Promise<void> => {
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
            mimeType: true,
            fileHash: true
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

    // 检查是否为图片
    if (!userFile.storage.mimeType.startsWith('image/')) {
       res.status(400).json({
         success: false,
         message: '该文件不是图片'
       });
       return;
    }

    // 检查物理文件是否存在
    if (!fs.existsSync(userFile.storage.filePath)) {
      res.status(404).json({
        success: false,
        message: '文件源已丢失'
      });
      return;
    }

    // 缩略图存放路径
    const thumbnailsDir = path.join(process.cwd(), 'thumbnails');
    ensureDirectoryExists(thumbnailsDir);
    
    // 生成缩略图文件名：hash-thumbnail.jpg (固定转为jpg或保留原格式，这里转为 webp 或 jpg 以节省空间)
    const thumbnailName = `${userFile.storage.fileHash}-thumb.webp`;
    const thumbnailPath = path.join(thumbnailsDir, thumbnailName);

    // 如果缩略图已存在，直接返回
    if (fs.existsSync(thumbnailPath)) {
      res.setHeader('Content-Type', 'image/webp');
      // 设置缓存控制，缩略图一般不变
      res.setHeader('Cache-Control', 'public, max-age=31536000'); 
      res.sendFile(thumbnailPath);
      return;
    }

    // 如果不存在，实时生成并保存
    try {
      await sharp(userFile.storage.filePath)
        .resize(200, 200, {
          fit: 'cover',
          position: 'center'
        })
        .webp({ quality: 80 })
        .toFile(thumbnailPath);

      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.sendFile(thumbnailPath);
    } catch (sharpError) {
      console.error('Thumbnail generation error:', sharpError);
      // 如果生成失败（比如图片损坏），降级返回原图? 或者返回错误。
      // 为防止大图加载过慢，建议返回错误或默认图。
      // 这里尝试直接返回原图作为由于缩略图生成失败的 fallback（如果不太大的话），
      // 但为了安全起见，还是返回错误，让前端展示默认图标。
      res.status(500).json({
        success: false,
        message: '缩略图生成失败'
      });
    }

  } catch (error) {
    console.error('Get thumbnail error:', error);
    res.status(500).json({
      success: false,
      message: '获取缩略图失败'
    });
  }
};