import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../../lib/prisma.js';
import { AuthRequest } from '../../types/index.js';
import { calculateFileHash, ensureDirectoryExists } from '../../utils/file.utils.js';
import { toStoredRelativePath } from '../../utils/storagePath.utils.js';
import { getStorageProvider } from '../../storage/index.js';
import { logOperation, LogOperationType, LogResourceType } from '../../services/logger.service.js';
import {
  assertValidMergeChunksBody,
  mergeChunkFilesToDisk,
  createEmptyMergedFileOnDisk,
  refineMimeTypeForMergedFile,
  persistMergedFileRecords,
  cleanupChunksAfterMerge,
  MergeUploadError,
  type MergeChunksBody
} from '../../services/mergeUpload.service.js';

/**
 * 检查文件是否存在（秒传检测）
 */
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
        chunkPath: toStoredRelativePath(chunkPath),
        status: 'completed'
      },
      create: {
        userId: req.user.id,
        fileHash,
        chunkIndex: parseInt(chunkIndex),
        chunkHash,
        chunkSize: req.file.size,
        chunkPath: toStoredRelativePath(chunkPath),
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
 * 合并分片上传：将已上传的分片写成最终文件并落库。
 *
 * 流程概要：校验 body → 磁盘合并（或空文件占位）→ 文本类 MIME 可带 charset →
 * 事务内 FileStorage / UserFile（含同名 version）与用量 → 清理临时分片与 DB 记录 → 审计日志 → 201 响应。
 *
 * 业务异常由 {@link MergeUploadError} 表示（多为 400）；其余落入500。
 * 具体实现见 `mergeUpload.service.ts`。
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

    // 解析并校验 fileHash、fileName、fileSize、mimeType、totalChunks 等必填项
    let body: MergeChunksBody;
    try {
      body = assertValidMergeChunksBody(req.body as Record<string, unknown>);
    } catch (e) {
      if (e instanceof MergeUploadError) {
        res.status(e.statusCode).json({ success: false, message: e.message });
        return;
      }
      throw e;
    }

    const { fileHash, fileName, fileSize, mimeType, totalChunks, parentId, conflictAction } = body;

    // totalChunks > 0：按序合并分片并校验整文件哈希；= 0：仅创建空文件
    const finalFilePath =
      totalChunks > 0
        ? await mergeChunkFilesToDisk({
            fileHash,
            fileName,
            userId: req.user.id,
            totalChunks
          })
        : createEmptyMergedFileOnDisk(fileHash, fileName);

    // 文本类可探测编码，写入库的 mimeType 可能追加 charset
    const finalMimeType = refineMimeTypeForMergedFile(finalFilePath, mimeType, fileName);

    // 事务：FileStorage 去重、UserFile 新建或版本更新、递增用户已用空间
    const result = await persistMergedFileRecords({
      finalFilePath,
      fileHash,
      fileSize,
      finalMimeType,
      userId: req.user.id,
      parentId,
      fileName,
      conflictAction
    });

    // 仅在非空文件合并后删除 chunks目录与 upload_chunk 行（须在落库成功之后）
    await cleanupChunksAfterMerge(fileHash, req.user.id, totalChunks);

    // 记录一条上传成功的操作日志
    await logOperation({
      req,
      userId: req.user!.id,
      operationType: LogOperationType.UPLOAD,
      resourceType: LogResourceType.FILE,
      resourceId: result.userFile.id,
      description: `Uploaded file (merged): ${result.userFile.fileName}`
    });

    // 返回列表刷新所需字段
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
    // 合并/校验等业务错误已在 service 中归类为 MergeUploadError
    if (error instanceof MergeUploadError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
      return;
    }
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

    const { fileHash, fileName, fileSize, mimeType, parentId, conflictAction } = req.body;

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
    const result = await prisma.$transaction(async (tx: any) => {
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

      // 检查文件名冲突与版本管理
      const existingUserFile = await tx.userFile.findFirst({
        where: {
          userId: req.user!.id,
          parentId: parentId ? parseInt(parentId) : null,
          fileName,
          isDeleted: false,
          fileType: 'file'
        },
        include: { storage: true }
      });

      let userFile;
      if (existingUserFile && conflictAction === 'version') {
           // --- 版本更新逻辑 ---
           // 1. Archive
           if (existingUserFile.storage) {
              // 历史记录表中新增一条旧记录
              await tx.fileHistory.create({
                  data: {
                      userFileId: existingUserFile.id,
                      storageId: existingUserFile.storageId!,
                      fileName: existingUserFile.fileName,
                      version: existingUserFile.version,
                      fileSize: existingUserFile.storage.fileSize
                  }
              });
           }
           // 2. Update Master，文件版本号加1
           userFile = await tx.userFile.update({
               where: { id: existingUserFile.id },
               data: {
                   storageId: existingFile!.id,
                   version: { increment: 1 },
                   updatedAt: new Date()
               }
           });
      } else {
          // 不存在文件记录 则创建用户文件记录
          userFile = await tx.userFile.create({
            data: {
              userId: req.user!.id,
              storageId: existingFile!.id,
              parentId: parentId ? parseInt(parentId) : null,
              fileName,
              fileType: 'file'
            }
          });
      }

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

    const storage = getStorageProvider();
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
        const storedPath = await storage.putFromLocalFile({
          localFilePath: req.file!.path,
          suggestedName: `${fileHash}-${req.file!.originalname}`,
        });
        fileStorage = await tx.fileStorage.create({
          data: {
            fileHash,
            filePath: storedPath,
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
        
        await storage.delete(req.file!.path);
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
