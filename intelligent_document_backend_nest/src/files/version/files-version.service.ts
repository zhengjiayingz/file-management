import { Injectable, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  LogOperationType,
  LogResourceType,
  OperationLogService,
} from '@/operation-log/operation-log.service';
import { PrismaService } from '@/prisma/prisma.service';
import { resolveStorageFilePath } from '../utils/storagePath.utils';

@Injectable()
export class FilesVersionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationLogService: OperationLogService,
  ) {}

  async getFileVersions(userId: number, fileId: number) {
    const userFile = await this.prisma.userFile.findFirst({
      where: {
        id: fileId,
        userId,
        isDeleted: false,
      },
    });

    if (!userFile) {
      throw new NotFoundException('文件不存在或无权访问');
    }

    const versions = await this.prisma.fileHistory.findMany({
      where: { userFileId: fileId },
      orderBy: { version: 'desc' },
    });

    return {
      success: true,
      data: versions.map((v) => ({
        id: v.id,
        version: v.version,
        fileName: v.fileName,
        fileSize: Number(v.fileSize),
        createdAt: v.createdAt,
      })),
    };
  }

  async rollbackVersion(
    req: Request,
    userId: number,
    fileId: number,
    versionId: number,
  ) {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const userFile = await tx.userFile.findFirst({
          where: { id: fileId, userId, isDeleted: false },
          include: { storage: true },
        });

        if (!userFile) {
          throw new Error('FILE_NOT_FOUND');
        }

        const targetVersion = await tx.fileHistory.findFirst({
          where: { id: versionId, userFileId: fileId },
        });

        if (!targetVersion) {
          throw new Error('VERSION_NOT_FOUND');
        }

        if (userFile.storage) {
          await tx.fileHistory.create({
            data: {
              userFileId: userFile.id,
              storageId: userFile.storageId!,
              fileName: userFile.fileName,
              version: userFile.version,
              fileSize: userFile.storage.fileSize,
            },
          });
        }

        const updatedFile = await tx.userFile.update({
          where: { id: userFile.id },
          data: {
            storageId: targetVersion.storageId,
            version: { increment: 1 },
            updatedAt: new Date(),
          },
        });

        await tx.fileStorage.update({
          where: { id: targetVersion.storageId },
          data: { referenceCount: { increment: 1 } },
        });

        await tx.user.update({
          where: { id: userId },
          data: {
            storageUsed: { increment: targetVersion.fileSize },
          },
        });

        return updatedFile;
      });

      await this.operationLogService.logOperation({
        req,
        userId,
        operationType: LogOperationType.VERSION_ROLLBACK,
        resourceType: LogResourceType.FILE,
        resourceId: result.id,
        description: `Rolled back file ${result.fileName} to version`,
      });

      return {
        success: true,
        message: '回滚成功',
        data: { version: result.version },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'FILE_NOT_FOUND') {
        throw new NotFoundException('文件不存在');
      }
      if (msg === 'VERSION_NOT_FOUND') {
        throw new NotFoundException('版本不存在');
      }
      throw error;
    }
  }

  async downloadVersion(
    req: Request,
    res: Response,
    userId: number,
    fileId: number,
    versionId: number,
  ): Promise<void> {
    const userFile = await this.prisma.userFile.findFirst({
      where: { id: fileId, userId, isDeleted: false },
    });

    if (!userFile) {
      res.status(404).json({ success: false, message: '文件不存在或无权访问' });
      return;
    }

    const version = await this.prisma.fileHistory.findFirst({
      where: {
        id: versionId,
        userFileId: fileId,
      },
      include: {
        storage: {
          select: {
            filePath: true,
            mimeType: true,
          },
        },
      },
    });

    if (!version?.storage) {
      res.status(404).json({ success: false, message: '版本文件不存在' });
      return;
    }

    const physicalPath = resolveStorageFilePath(version.storage.filePath);

    if (!fs.existsSync(physicalPath)) {
      res.status(404).json({ success: false, message: '物理文件已丢失' });
      return;
    }

    const isPreview = req.query.preview === 'true';
    const disposition = isPreview ? 'inline' : 'attachment';

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
      '.rm': 'application/vnd.rn-realmedia',
    };
    if (mimeMap[ext]) {
      contentType = mimeMap[ext];
    }

    if (
      isPreview &&
      (contentType.startsWith('text/') ||
        ext === '.txt' ||
        ext === '.md' ||
        ext === '.json' ||
        ext === '.js' ||
        ext === '.css' ||
        ext === '.html')
    ) {
      if (!contentType.includes('charset')) {
        contentType += '; charset=utf-8';
      }
    }

    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(version.fileName)}"`,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.sendFile(physicalPath);
  }
}
