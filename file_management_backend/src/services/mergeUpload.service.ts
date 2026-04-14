import path from 'path';
import fs from 'fs';
// @ts-ignore
import jschardet from 'jschardet';
import prisma from '../lib/prisma.js';
import { calculateFileHash, ensureDirectoryExists } from '../utils/file.utils.js';
import {
  getUploadRootDir,
  resolveStorageFilePath,
  toStoredRelativePath
} from '../utils/storagePath.utils.js';
import type { FileStorage, UserFile } from '@prisma/client';

/** 业务可预期的失败（合并参数、分片不全、哈希不符等），由控制器映射为 4xx */
export class MergeUploadError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'MergeUploadError';
  }
}

export type MergeChunksBody = {
  fileHash: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  parentId?: number;
  conflictAction?: string;
};

/** 校验 merge 接口 body，不通过时抛出 MergeUploadError */
export function assertValidMergeChunksBody(body: Record<string, unknown>): MergeChunksBody {
  const { fileHash, fileName, fileSize, mimeType, totalChunks, parentId, conflictAction } = body;
  if (
    !fileHash ||
    !fileName ||
    fileSize === undefined ||
    fileSize === null ||
    !mimeType ||
    totalChunks === undefined ||
    totalChunks === null
  ) {
    throw new MergeUploadError('合并参数不完整', 400);
  }
  return {
    fileHash: String(fileHash),
    fileName: String(fileName),
    fileSize: Number(fileSize as number | bigint | string),
    mimeType: String(mimeType),
    totalChunks: Number(totalChunks),
    parentId: parentId !== undefined && parentId !== null ? Number(parentId) : undefined,
    conflictAction: conflictAction !== undefined ? String(conflictAction) : undefined
  };
}

function buildFinalFilePath(fileHash: string, fileName: string): string {
  const uploadsDir = getUploadRootDir();
  ensureDirectoryExists(uploadsDir);
  return path.join(uploadsDir, `${fileHash}-${fileName}`);
}

/**
 * 从已上传分片按序合并到最终路径，并校验与 fileHash 一致。
 * @returns 最终文件绝对路径
 */
export async function mergeChunkFilesToDisk(params: {
  fileHash: string;
  fileName: string;
  userId: number;
  totalChunks: number;
}): Promise<string> {
  const { fileHash, fileName, userId, totalChunks } = params;

  const uploadedChunks = await prisma.uploadChunk.findMany({
    where: {
      fileHash,
      userId,
      status: 'completed'
    },
    orderBy: { chunkIndex: 'asc' }
  });

  if (uploadedChunks.length !== totalChunks) {
    throw new MergeUploadError('分片不完整，无法合并', 400);
  }

  const finalFilePath = buildFinalFilePath(fileHash, fileName);
  const writeStream = fs.createWriteStream(finalFilePath);

  for (const chunk of uploadedChunks) {
    const chunkData = fs.readFileSync(resolveStorageFilePath(chunk.chunkPath));
    writeStream.write(chunkData);
  }
  writeStream.end();

  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', () => resolve());
    writeStream.on('error', reject);
  });

  const mergedFileHash = calculateFileHash(finalFilePath);
  if (mergedFileHash !== fileHash) {
    fs.unlinkSync(finalFilePath);
    throw new MergeUploadError('文件合并失败，哈希值不匹配', 400);
  }

  return finalFilePath;
}

/** 空文件：在 uploads 下创建 0 字节最终文件 */
export function createEmptyMergedFileOnDisk(fileHash: string, fileName: string): string {
  const finalFilePath = buildFinalFilePath(fileHash, fileName);
  fs.writeFileSync(finalFilePath, '');
  return finalFilePath;
}

/** 文本类文件尝试探测 charset，写入库用 mime 串可能带 charset */
export function refineMimeTypeForMergedFile(
  finalFilePath: string,
  mimeType: string,
  fileName: string
): string {
  let finalMimeType = mimeType;
  if (mimeType.startsWith('text/') || /\.(txt|md|json|csv|html|css|js|ts)$/i.test(fileName)) {
    try {
      const buffer = Buffer.alloc(4096);
      const fd = fs.openSync(finalFilePath, 'r');
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
      fs.closeSync(fd);

      const slice = buffer.slice(0, bytesRead);
      const detected = jschardet.detect(slice);

      if (detected && detected.encoding && detected.confidence > 0.8) {
        finalMimeType = `${mimeType}; charset=${detected.encoding.toLowerCase()}`;
      }
    } catch (e) {
      console.warn('Encoding detection failed:', e);
    }
  }
  return finalMimeType;
}

export type MergePersistParams = {
  finalFilePath: string;
  fileHash: string;
  fileSize: number;
  finalMimeType: string;
  userId: number;
  parentId?: number;
  fileName: string;
  conflictAction?: string;
};

/**
 * 在单事务内落库合并结果：物理文件路径已在合并阶段写入磁盘，此处只做元数据与用量。
 *
 * 顺序要点：
 * 1. **FileStorage**：按 `fileHash` 去重；已存在则复用（秒传/重复内容），否则新建一条。
 * 2. **UserFile**：同目录同名且 `conflictAction === 'version'` 时写历史快照后更新指向新 storage 并升版本；
 *    否则新建一条（含与秒传一致的「保存两者」重名并存）。
 * 3. **用户用量**：本次上传字节数计入 `user.storageUsed`（与合并/秒传口径一致）。
 */
export async function persistMergedFileRecords(
  params: MergePersistParams
): Promise<{ userFile: UserFile; fileStorage: FileStorage }> {
  const {
    finalFilePath,
    fileHash,
    fileSize,
    finalMimeType,
    userId,
    parentId,
    fileName,
    conflictAction
  } = params;

  return prisma.$transaction(async (tx: any) => {
    // 内容寻址：相同 fileHash 共用一条 FileStorage，避免重复存盘
    let fileStorage = await tx.fileStorage.findUnique({ where: { fileHash } });
    if (!fileStorage) {
      fileStorage = await tx.fileStorage.create({
        data: {
          fileHash,
          filePath: toStoredRelativePath(finalFilePath),
          fileSize: BigInt(fileSize),
          mimeType: finalMimeType,
          referenceCount: 1,
          status: 'active'
        }
      });
    }

    // 当前用户、当前父目录下的同名未删文件（用于版本覆盖或并存新建）
    const existingUserFile = await tx.userFile.findFirst({
      where: {
        userId,
        parentId: parentId !== undefined && parentId !== null ? parseInt(String(parentId), 10) : null,
        fileName,
        isDeleted: false,
        fileType: 'file'
      },
      include: { storage: true }
    });

    let userFile: UserFile;
    if (existingUserFile && conflictAction === 'version') {
      // 覆盖同名：旧版写入 file_history，再指向本次 fileStorage
      if (existingUserFile.storage) {
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
      // 更新 UserFile，指向本次 fileStorage，版本号加 1
      userFile = await tx.userFile.update({
        where: { id: existingUserFile.id },
        data: {
          storageId: fileStorage.id,
          version: { increment: 1 },
          updatedAt: new Date()
        }
      });
    } else {
      // 无同名冲突，或前端选择「保存两者」等：新建 UserFile，可与同名记录并存
      userFile = await tx.userFile.create({
        data: {
          userId,
          storageId: fileStorage.id,
          parentId: parentId !== undefined && parentId !== null ? parseInt(String(parentId), 10) : null,
          fileName,
          fileType: 'file'
        }
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        storageUsed: { increment: BigInt(fileSize) }
      }
    });

    return { userFile, fileStorage };
  });
}

/** 合并成功后删除临时分片目录与 upload_chunk 记录 */
export async function cleanupChunksAfterMerge(
  fileHash: string,
  userId: number,
  totalChunks: number
): Promise<void> {
  if (totalChunks <= 0) return;

  const chunksDir = path.join(process.cwd(), 'chunks', fileHash);
  if (fs.existsSync(chunksDir)) {
    // 删除分片目录
    fs.rmSync(chunksDir, { recursive: true, force: true });
  }

  // 删除数据库中分片记录
  await prisma.uploadChunk.deleteMany({
    where: {
      fileHash,
      userId
    }
  });
}
