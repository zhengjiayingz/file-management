import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../../lib/prisma.js';
import { AuthRequest } from '../../types/index.js';
import { calculateFileHash, ensureDirectoryExists } from '../../utils/file.utils.js';
import { logOperation, LogOperationType, LogResourceType } from '../../services/logger.service.js';

/**
 * 检查文件是否存在（秒传检测）
 */
// ... (checkFileExists and uploadChunk remain same, skipping for brevity in this replace block if possible, but tool requires contiguous block or use multi_replace. Let's use multi_replace logic by providing the whole file content or targeted chunks)
// Since I need to add import at top and modify 3 functions, I will use multi_replace strategy logic but via single replace if I can target the whole file or use multi_replace tool.
// I will use replace_file_content for imports first, then individual function updates.
// Wait, I can't use multiple tool calls in parallel if I need sequential updates.
// I'll update the import first.

export const checkFileExists = async (req: AuthRequest, res: Response): Promise<void> => {
// ...

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

    if (!fileHash || !fileName || fileSize === undefined || fileSize === null || !mimeType || totalChunks === undefined || totalChunks === null) {
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



    // 记录操作日志
    await logOperation({
      req,
      userId: req.user!.id,
      operationType: LogOperationType.UPLOAD,
      resourceType: LogResourceType.FILE,
      resourceId: result.userFile.id,
      description: `Uploaded file (merged): ${result.userFile.fileName}`
    });

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


    // 查找已存在的文件（包括待删除的）
    let existingFile = await prisma.fileStorage.findUnique({
      where: { fileHash }
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
      // 如果文件状态为 pending_delete，将其复活
      if (existingFile!.status === 'pending_delete') {
        existingFile = await tx.fileStorage.update({
          where: { id: existingFile!.id },
          data: {
            status: 'active',
            markedDeleteAt: null
          }
        });
        console.log(`Resurrected file storage for instant upload: ${fileHash}`);
      }

      // 增加引用计数
      await tx.fileStorage.update({
        where: { id: existingFile!.id },
        data: { referenceCount: { increment: 1 } }
      });

      // 创建用户文件记录
      const userFile = await tx.userFile.create({
        data: {
          userId: req.user!.id,
          storageId: existingFile!.id,
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



    // 记录操作日志
    await logOperation({
      req,
      userId: req.user!.id,
      operationType: LogOperationType.UPLOAD,
      resourceType: LogResourceType.FILE,
      resourceId: result.id,
      description: `Uploaded file (instant): ${result.fileName}`
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
      // 检查文件是否已存在（包括待删除的文件）
      let fileStorage = await tx.fileStorage.findUnique({
        where: { fileHash }
      });

      // 如果文件存在但状态为 pending_delete，将其"复活"
      if (fileStorage && fileStorage.status === 'pending_delete') {
        fileStorage = await tx.fileStorage.update({
          where: { id: fileStorage.id },
          data: {
            status: 'active',
            markedDeleteAt: null
          }
        });
        console.log(`Resurrected file storage for hash: ${fileHash}`);
      }

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



    // 记录操作日志
    await logOperation({
      req,
      userId: req.user!.id,
      operationType: LogOperationType.UPLOAD,
      resourceType: LogResourceType.FILE,
      resourceId: result.userFile.id,
      description: `Uploaded file: ${result.userFile.fileName}`
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
