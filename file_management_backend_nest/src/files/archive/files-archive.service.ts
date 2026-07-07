import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import yauzl from 'yauzl';
import type { Entry, ZipFile } from 'yauzl';
import {
  LogOperationType,
  LogResourceType,
  OperationLogService,
} from '@/operation-log/operation-log.service';
import { PrismaService } from '@/prisma/prisma.service';
import {
  MergeUploadService,
  type RegisterLocalConflictAction,
} from '../upload/merge-upload.service';
import { resolveStorageFilePath } from '../utils/storagePath.utils';

const ZIP_EXT = new Set(['.zip', '.jar', '.war', '.ear']);
const MAX_SOURCE_ZIP_BYTES = 200 * 1024 * 1024;
const MAX_LIST_ENTRIES = 8000;
const MAX_EXTRACT_FILES = 500;
const MAX_EXTRACT_TOTAL_BYTES = 500 * 1024 * 1024;

function posixNorm(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '');
}

function safeZipEntryName(fileName: string): void {
  const n = posixNorm(fileName.replace(/\0/g, ''));
  if (!n || n.includes('..') || n.split('/').some((seg) => seg === '..')) {
    throw new Error('非法的压缩包条目路径');
  }
}

function openZip(physicalPath: string, autoClose: boolean): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      physicalPath,
      { lazyEntries: true, strictFileNames: false, autoClose },
      (err, zipfile) => {
        if (err || !zipfile) reject(err ?? new Error('无法打开 ZIP'));
        else resolve(zipfile);
      },
    );
  });
}

function openEntryReadStream(
  zipfile: ZipFile,
  entry: Entry,
): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) reject(err);
      else resolve(stream);
    });
  });
}

async function streamReadableToFile(
  readStream: Readable,
  destAbs: string,
): Promise<void> {
  await fs.mkdir(path.dirname(destAbs), { recursive: true });
  await pipeline(readStream, fssync.createWriteStream(destAbs));
}

function isDirEntry(rawPath: string): boolean {
  return /[/\\]$/.test(rawPath);
}

function parseParentId(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === 'root') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = parseInt(raw.trim(), 10);
    return Number.isNaN(n) ? Number.NaN : n;
  }
  return Number.NaN;
}

function parsePathsBody(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new BadRequestException('请提供非空的 paths 数组');
  }
  const uniquePaths = [
    ...new Set(
      raw.map((p: unknown) => {
        if (typeof p === 'string') return posixNorm(p);
        if (typeof p === 'number' || typeof p === 'boolean') {
          return posixNorm(String(p));
        }
        return '';
      }),
    ),
  ].filter(Boolean);
  if (uniquePaths.length === 0) {
    throw new BadRequestException('paths 无效');
  }
  return uniquePaths;
}

@Injectable()
export class FilesArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mergeUploadService: MergeUploadService,
    private readonly operationLogService: OperationLogService,
  ) {}

  private async userCanExtractArchive(userId: number): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, vipExpireAt: true },
    });
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role === 'vip') {
      if (!user.vipExpireAt) return true;
      return user.vipExpireAt > new Date();
    }
    return false;
  }

  private async loadZipUserFile(fileId: number, userId: number) {
    return this.prisma.userFile.findFirst({
      where: {
        id: fileId,
        userId,
        isDeleted: false,
        fileType: 'file',
      },
      include: {
        storage: {
          select: {
            filePath: true,
            mimeType: true,
            fileSize: true,
          },
        },
      },
    });
  }

  private isZipLike(userFile: {
    fileName: string;
    storage: { mimeType: string | null } | null;
  }): boolean {
    const ext = path.extname(userFile.fileName).toLowerCase();
    const mime = (userFile.storage?.mimeType || '').toLowerCase();
    const looksZipMime = /^application\/(zip|x-zip-compressed)/i.test(mime);
    return ZIP_EXT.has(ext) || looksZipMime;
  }

  private async assertExtractAllowed(userId: number): Promise<void> {
    const allowed = await this.userCanExtractArchive(userId);
    if (!allowed) {
      throw new ForbiddenException('无在线解压权限（仅 VIP 与管理员）');
    }
  }

  async listArchiveEntries(userId: number, fileId: number) {
    await this.assertExtractAllowed(userId);

    const userFile = await this.loadZipUserFile(fileId, userId);
    if (!userFile?.storage) {
      throw new NotFoundException('文件不存在');
    }
    if (!this.isZipLike(userFile)) {
      throw new BadRequestException('当前仅支持 ZIP 格式在线解压');
    }

    const physicalPath = resolveStorageFilePath(userFile.storage.filePath);
    try {
      const st = await fs.stat(physicalPath);
      if (st.size > MAX_SOURCE_ZIP_BYTES) {
        throw new BadRequestException(
          `压缩包过大（超过 ${Math.floor(MAX_SOURCE_ZIP_BYTES / 1024 / 1024)}MB）`,
        );
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new NotFoundException('文件源已丢失');
    }

    const zipfile = await openZip(physicalPath, true);
    const entries: { path: string; isDirectory: boolean; size: number }[] = [];
    let truncated = false;

    await new Promise<void>((resolve, reject) => {
      zipfile.on('entry', (entry: Entry) => {
        if (entries.length >= MAX_LIST_ENTRIES) {
          truncated = true;
          zipfile.readEntry();
          return;
        }
        const rawPath = entry.fileName.replace(/\0/g, '');
        if (entry.isEncrypted()) {
          zipfile.readEntry();
          return;
        }
        try {
          safeZipEntryName(rawPath);
        } catch {
          zipfile.readEntry();
          return;
        }
        const p = posixNorm(rawPath);
        const isDir = isDirEntry(rawPath);
        const size = entry.uncompressedSize;
        const displayPath = isDir && !p.endsWith('/') ? `${p}/` : p;
        entries.push({
          path: displayPath,
          isDirectory: isDir,
          size: isDir ? 0 : size,
        });
        zipfile.readEntry();
      });
      zipfile.once('end', () => resolve());
      zipfile.once('error', reject);
      zipfile.readEntry();
    });

    return {
      success: true,
      data: {
        archiveName: userFile.fileName,
        entries,
        truncated,
      },
    };
  }

  private async wouldExtractPathConflictWithExisting(
    userId: number,
    driveParentId: number | null,
    relFilePath: string,
  ): Promise<boolean> {
    const rel = posixNorm(relFilePath);
    const base = path.posix.basename(rel);
    const parentDir = path.posix.dirname(rel);
    const dirSegments =
      parentDir === '.' || parentDir === ''
        ? []
        : parentDir.split('/').filter(Boolean);

    let currentParentId: number | null = driveParentId;
    for (const seg of dirSegments) {
      const folder = await this.prisma.userFile.findFirst({
        where: {
          userId,
          parentId: currentParentId,
          fileName: seg,
          fileType: 'folder',
          isDeleted: false,
        },
      });
      if (!folder) return false;
      currentParentId = folder.id;
    }

    const existingFile = await this.prisma.userFile.findFirst({
      where: {
        userId,
        parentId: currentParentId,
        fileName: base,
        fileType: 'file',
        isDeleted: false,
      },
    });
    return !!existingFile;
  }

  async checkArchiveExtractConflicts(
    userId: number,
    fileId: number,
    body: { parentId?: unknown; paths?: unknown },
  ) {
    await this.assertExtractAllowed(userId);

    const archiveUserFile = await this.loadZipUserFile(fileId, userId);
    if (!archiveUserFile?.storage) {
      throw new NotFoundException('文件不存在');
    }
    if (!this.isZipLike(archiveUserFile)) {
      throw new BadRequestException('当前仅支持 ZIP 格式在线解压');
    }

    const driveParentId = parseParentId(body.parentId);
    if (Number.isNaN(driveParentId)) {
      throw new BadRequestException('parentId 无效');
    }

    const uniquePaths = parsePathsBody(body.paths);
    if (uniquePaths.length > MAX_EXTRACT_FILES) {
      throw new BadRequestException(`单次最多解压 ${MAX_EXTRACT_FILES} 个文件`);
    }

    if (driveParentId !== null) {
      const parentFolder = await this.prisma.userFile.findFirst({
        where: {
          id: driveParentId,
          userId,
          fileType: 'folder',
          isDeleted: false,
        },
      });
      if (!parentFolder) {
        throw new NotFoundException('目标文件夹不存在');
      }
    }

    const conflictingPaths: string[] = [];
    for (const relPath of uniquePaths) {
      try {
        safeZipEntryName(relPath);
      } catch {
        continue;
      }
      const conflict = await this.wouldExtractPathConflictWithExisting(
        userId,
        driveParentId,
        relPath,
      );
      if (conflict) conflictingPaths.push(relPath);
    }

    return {
      success: true,
      data: {
        hasConflict: conflictingPaths.length > 0,
        conflictingPaths,
      },
    };
  }

  private collectDirPathsFromFiles(filePaths: string[]): string[] {
    const dirs = new Set<string>();
    for (const fp of filePaths) {
      let d = path.posix.dirname(posixNorm(fp));
      while (d && d !== '.') {
        dirs.add(d);
        d = path.posix.dirname(d);
      }
    }
    return [...dirs].sort((a, b) => a.split('/').length - b.split('/').length);
  }

  private async getOrCreateFolder(
    userId: number,
    parentId: number | null,
    folderName: string,
  ): Promise<number> {
    const existing = await this.prisma.userFile.findFirst({
      where: {
        userId,
        parentId,
        fileName: folderName,
        isDeleted: false,
        fileType: 'folder',
      },
    });
    if (existing) return existing.id;
    const created = await this.prisma.userFile.create({
      data: {
        userId,
        parentId,
        fileName: folderName,
        fileType: 'folder',
      },
    });
    return created.id;
  }

  async extractArchiveToDrive(
    req: Request,
    userId: number,
    fileId: number,
    body: {
      parentId?: unknown;
      paths?: unknown;
      conflictAction?: unknown;
    },
  ) {
    let tempRoot: string | null = null;
    let zipfile: ZipFile | null = null;

    try {
      await this.assertExtractAllowed(userId);

      const driveParentId = parseParentId(body.parentId);
      if (Number.isNaN(driveParentId)) {
        throw new BadRequestException('parentId 无效');
      }

      const uniquePaths = parsePathsBody(body.paths);
      const allowedConflict = new Set(['version', 'duplicate', 'suffix']);
      const conflictAction: RegisterLocalConflictAction = allowedConflict.has(
        String(body.conflictAction),
      )
        ? (String(body.conflictAction) as RegisterLocalConflictAction)
        : 'suffix';

      if (uniquePaths.length > MAX_EXTRACT_FILES) {
        throw new BadRequestException(
          `单次最多解压 ${MAX_EXTRACT_FILES} 个文件`,
        );
      }

      if (driveParentId !== null) {
        const parentFolder = await this.prisma.userFile.findFirst({
          where: {
            id: driveParentId,
            userId,
            fileType: 'folder',
            isDeleted: false,
          },
        });
        if (!parentFolder) {
          throw new NotFoundException('目标文件夹不存在');
        }
      }

      const userFile = await this.loadZipUserFile(fileId, userId);
      if (!userFile?.storage) {
        throw new NotFoundException('文件不存在');
      }
      if (!this.isZipLike(userFile)) {
        throw new BadRequestException('当前仅支持 ZIP 格式在线解压');
      }

      const physicalPath = resolveStorageFilePath(userFile.storage.filePath);
      let srcStat;
      try {
        srcStat = await fs.stat(physicalPath);
      } catch {
        throw new NotFoundException('文件源已丢失');
      }
      if (srcStat.size > MAX_SOURCE_ZIP_BYTES) {
        throw new BadRequestException(
          `压缩包过大（超过 ${Math.floor(MAX_SOURCE_ZIP_BYTES / 1024 / 1024)}MB）`,
        );
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { storageUsed: true, storageQuota: true },
      });
      if (!user) {
        throw new NotFoundException('用户不存在');
      }

      zipfile = await openZip(physicalPath, false);
      const byPath = new Map<
        string,
        { entry: Entry; isDirectory: boolean; size: number }
      >();

      await new Promise<void>((resolve, reject) => {
        zipfile!.on('entry', (entry: Entry) => {
          const rawPath = entry.fileName.replace(/\0/g, '');
          if (entry.isEncrypted()) {
            zipfile!.readEntry();
            return;
          }
          try {
            safeZipEntryName(rawPath);
          } catch {
            zipfile!.readEntry();
            return;
          }
          const p = posixNorm(rawPath);
          const isDir = isDirEntry(rawPath);
          const displayPath = isDir && !p.endsWith('/') ? `${p}/` : p;
          const size = entry.uncompressedSize;
          byPath.set(displayPath, { entry, isDirectory: isDir, size });
          if (!isDir) {
            byPath.set(p, { entry, isDirectory: false, size });
          }
          zipfile!.readEntry();
        });
        zipfile!.once('end', () => resolve());
        zipfile!.once('error', reject);
        zipfile!.readEntry();
      });

      let totalBytes = 0;
      const fileEntries: { relPath: string; entry: Entry; size: number }[] = [];

      for (const want of uniquePaths) {
        const w = posixNorm(want);
        if (!w || w.endsWith('/')) {
          throw new BadRequestException(
            'paths 中请只传文件路径，不要传目录条目',
          );
        }
        const hit = byPath.get(w);
        if (!hit || hit.isDirectory) {
          throw new BadRequestException(`压缩包中不存在文件: ${w}`);
        }
        totalBytes += hit.size;
        fileEntries.push({ relPath: w, entry: hit.entry, size: hit.size });
      }

      if (totalBytes > MAX_EXTRACT_TOTAL_BYTES) {
        throw new BadRequestException(
          `所选文件解压后总大小超过 ${Math.floor(MAX_EXTRACT_TOTAL_BYTES / 1024 / 1024)}MB`,
        );
      }

      const need = user.storageUsed + BigInt(totalBytes);
      if (need > user.storageQuota) {
        throw new BadRequestException('存储空间不足，无法解压到网盘');
      }

      tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fm-zip-import-'));

      for (const { relPath, entry } of fileEntries) {
        const destAbs = path.join(tempRoot, relPath.split('/').join(path.sep));
        const rs = await openEntryReadStream(zipfile, entry);
        await streamReadableToFile(rs, destAbs);
      }

      const relFiles = fileEntries.map((f) => f.relPath).sort();
      const dirRels = this.collectDirPathsFromFiles(relFiles);
      const folderIdByRel = new Map<string, number>();

      for (const rel of dirRels) {
        const parentRel = path.posix.dirname(rel);
        const seg = path.posix.basename(rel);
        let parentForCreate: number | null;
        if (parentRel === '.' || parentRel === '') {
          parentForCreate = driveParentId;
        } else {
          const id = folderIdByRel.get(parentRel);
          if (id === undefined) {
            throw new BadRequestException('内部错误：父目录未创建');
          }
          parentForCreate = id;
        }
        const fid = await this.getOrCreateFolder(userId, parentForCreate, seg);
        folderIdByRel.set(rel, fid);
      }

      let fileCount = 0;
      for (const relPath of relFiles) {
        const parentRel = path.posix.dirname(relPath);
        const base = path.posix.basename(relPath);
        const abs = path.join(tempRoot, relPath.split('/').join(path.sep));
        const parentId =
          parentRel === '.' || parentRel === ''
            ? driveParentId
            : (folderIdByRel.get(parentRel) ?? driveParentId);

        await this.mergeUploadService.registerLocalFileInDrive({
          absolutePath: abs,
          userId,
          parentId,
          logicalFileName: base,
          conflictAction,
        });
        fileCount++;
      }

      await this.operationLogService.logOperation({
        req,
        userId,
        operationType: LogOperationType.UPLOAD,
        resourceType: LogResourceType.FILE,
        resourceId: userFile.id,
        description: `在线解压到网盘: ${userFile.fileName} (${fileCount} 个文件)`,
      });

      return {
        success: true,
        message: `已解压 ${fileCount} 个文件到当前目录`,
        data: { fileCount, folderCount: dirRels.length },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('非法的压缩包')) {
        throw new BadRequestException(msg);
      }
      throw error;
    } finally {
      if (zipfile?.isOpen) {
        zipfile.close();
      }
      if (tempRoot) {
        await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}
