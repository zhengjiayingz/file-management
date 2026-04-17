import { Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import fssync from 'fs';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import os from 'os';
import yauzl from 'yauzl';
import type { Entry, ZipFile } from 'yauzl';
import prisma from '../../lib/prisma.js';
import { AuthRequest } from '../../types/index.js';
import { resolveStorageFilePath } from '../../utils/storagePath.utils.js';
import { logOperation, LogOperationType, LogResourceType } from '../../services/logger.service.js';
import {
  registerLocalFileInDrive,
  type RegisterLocalConflictAction
} from '../../services/mergeUpload.service.js';

/** 仅支持 ZIP（含 jar 等 zip 容器） */
const ZIP_EXT = new Set(['.zip', '.jar', '.war', '.ear']);

const MAX_SOURCE_ZIP_BYTES = 200 * 1024 * 1024; // 200MB
const MAX_LIST_ENTRIES = 8000;
const MAX_EXTRACT_FILES = 500;
const MAX_EXTRACT_TOTAL_BYTES = 500 * 1024 * 1024;

async function userCanExtractArchive(userId: number): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, vipExpireAt: true }
  });
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'vip') {
    if (!user.vipExpireAt) return true;
    return user.vipExpireAt > new Date();
  }
  return false;
}

function posixNorm(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '');
}

function safeZipEntryName(fileName: string): void {
  const n = posixNorm(fileName.replace(/\0/g, ''));
  if (!n || n.includes('..') || n.split('/').some((p) => p === '..')) {
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
      }
    );
  });
}

function openEntryReadStream(zipfile: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) reject(err);
      else resolve(stream!);
    });
  });
}

async function streamReadableToFile(readStream: Readable, destAbs: string): Promise<void> {
  await fs.mkdir(path.dirname(destAbs), { recursive: true });
  await pipeline(readStream, fssync.createWriteStream(destAbs));
}

async function loadZipUserFile(fileId: number, userId: number) {
  return prisma.userFile.findFirst({
    where: {
      id: fileId,
      userId,
      isDeleted: false,
      fileType: 'file'
    },
    include: {
      storage: {
        select: {
          filePath: true,
          mimeType: true,
          fileSize: true
        }
      }
    }
  });
}

function isZipLike(userFile: { fileName: string; storage: { mimeType: string | null } | null }): boolean {
  const ext = path.extname(userFile.fileName).toLowerCase();
  const mime = (userFile.storage?.mimeType || '').toLowerCase();
  const looksZipMime = /^application\/(zip|x-zip-compressed)/i.test(mime);
  return ZIP_EXT.has(ext) || looksZipMime;
}

function isDirEntry(rawPath: string): boolean {
  return /[/\\]$/.test(rawPath);
}

/**
 * VIP/管理员：列出 ZIP 内条目（不整包解压到业务目录）
 * 使用 yauzl 解析中央目录，兼容 unzipper 无法列出的部分 ZIP。
 */
export const listArchiveEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const allowed = await userCanExtractArchive(req.user.id);
    if (!allowed) {
      res.status(403).json({ success: false, message: '无在线解压权限（仅 VIP 与管理员）' });
      return;
    }

    const fileId = parseInt(req.params.id, 10);
    if (Number.isNaN(fileId)) {
      res.status(400).json({ success: false, message: '无效的文件ID' });
      return;
    }

    const userFile = await loadZipUserFile(fileId, req.user.id);
    if (!userFile || !userFile.storage) {
      res.status(404).json({ success: false, message: '文件不存在' });
      return;
    }

    if (!isZipLike(userFile)) {
      res.status(400).json({ success: false, message: '当前仅支持 ZIP 格式在线解压' });
      return;
    }

    const physicalPath = resolveStorageFilePath(userFile.storage.filePath);
    try {
      const st = await fs.stat(physicalPath);
      if (st.size > MAX_SOURCE_ZIP_BYTES) {
        res.status(400).json({
          success: false,
          message: `压缩包过大（超过 ${Math.floor(MAX_SOURCE_ZIP_BYTES / 1024 / 1024)}MB）`
        });
        return;
      }
    } catch {
      res.status(404).json({ success: false, message: '文件源已丢失' });
      return;
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
          size: isDir ? 0 : size
        });
        zipfile.readEntry();
      });
      zipfile.once('end', () => resolve());
      zipfile.once('error', reject);
      zipfile.readEntry();
    });

    res.json({
      success: true,
      data: {
        archiveName: userFile.fileName,
        entries,
        truncated
      }
    });
  } catch (error: unknown) {
    console.error('listArchiveEntries error:', error);
    res.status(500).json({ success: false, message: '读取压缩包列表失败' });
  }
};

/**
 * 判断解压后的相对路径是否会在「目标父目录已存在的文件夹链」末端与已有文件同名冲突。
 * 若路径上某级文件夹尚不存在，解压时会新建空文件夹，不产生与已有文件的冲突。
 */
async function wouldExtractPathConflictWithExisting(
  userId: number,
  driveParentId: number | null,
  relFilePath: string
): Promise<boolean> {
  const rel = posixNorm(relFilePath);
  const base = path.posix.basename(rel);
  const parentDir = path.posix.dirname(rel);
  const dirSegments =
    parentDir === '.' || parentDir === '' ? [] : parentDir.split('/').filter(Boolean);

  let currentParentId: number | null = driveParentId;
  for (const seg of dirSegments) {
    const folder = await prisma.userFile.findFirst({
      where: {
        userId,
        parentId: currentParentId,
        fileName: seg,
        fileType: 'folder',
        isDeleted: false
      }
    });
    if (!folder) {
      return false;
    }
    currentParentId = folder.id;
  }

  const existingFile = await prisma.userFile.findFirst({
    where: {
      userId,
      parentId: currentParentId,
      fileName: base,
      fileType: 'file',
      isDeleted: false
    }
  });
  return !!existingFile;
}

/**
 * 解压前预检：不解压、不读 ZIP，仅根据网盘目录判断是否将与已有文件重名
 */
export const checkArchiveExtractConflicts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const allowed = await userCanExtractArchive(req.user.id);
    if (!allowed) {
      res.status(403).json({ success: false, message: '无在线解压权限（仅 VIP 与管理员）' });
      return;
    }

    const fileId = parseInt(req.params.id, 10);
    if (Number.isNaN(fileId)) {
      res.status(400).json({ success: false, message: '无效的文件ID' });
      return;
    }

    const archiveUserFile = await loadZipUserFile(fileId, req.user.id);
    if (!archiveUserFile || !archiveUserFile.storage) {
      res.status(404).json({ success: false, message: '文件不存在' });
      return;
    }
    if (!isZipLike(archiveUserFile)) {
      res.status(400).json({ success: false, message: '当前仅支持 ZIP 格式在线解压' });
      return;
    }

    const rawParent = req.body?.parentId;
    const driveParentId =
      rawParent === undefined || rawParent === null || rawParent === 'root'
        ? null
        : parseInt(String(rawParent), 10);
    if (driveParentId !== null && Number.isNaN(driveParentId)) {
      res.status(400).json({ success: false, message: 'parentId 无效' });
      return;
    }

    const pathsIn = req.body?.paths;
    if (!Array.isArray(pathsIn) || pathsIn.length === 0) {
      res.status(400).json({ success: false, message: '请提供非空的 paths 数组' });
      return;
    }

    const uniquePaths = [...new Set(pathsIn.map((p: unknown) => posixNorm(String(p))))].filter(Boolean);
    if (uniquePaths.length === 0) {
      res.status(400).json({ success: false, message: 'paths 无效' });
      return;
    }
    if (uniquePaths.length > MAX_EXTRACT_FILES) {
      res.status(400).json({
        success: false,
        message: `单次最多解压 ${MAX_EXTRACT_FILES} 个文件`
      });
      return;
    }

    if (driveParentId !== null) {
      const parentFolder = await prisma.userFile.findFirst({
        where: {
          id: driveParentId,
          userId: req.user.id,
          fileType: 'folder',
          isDeleted: false
        }
      });
      if (!parentFolder) {
        res.status(404).json({ success: false, message: '目标文件夹不存在' });
        return;
      }
    }

    const conflictingPaths: string[] = [];
    for (const relPath of uniquePaths) {
      try {
        safeZipEntryName(relPath);
      } catch {
        continue;
      }
      const conflict = await wouldExtractPathConflictWithExisting(req.user.id, driveParentId, relPath);
      if (conflict) {
        conflictingPaths.push(relPath);
      }
    }

    res.json({
      success: true,
      data: {
        hasConflict: conflictingPaths.length > 0,
        conflictingPaths
      }
    });
  } catch (error: unknown) {
    console.error('checkArchiveExtractConflicts error:', error);
    res.status(500).json({ success: false, message: '检测重名失败' });
  }
};

function collectDirPathsFromFiles(filePaths: string[]): string[] {
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

async function getOrCreateFolder(userId: number, parentId: number | null, folderName: string): Promise<number> {
  const existing = await prisma.userFile.findFirst({
    where: {
      userId,
      parentId,
      fileName: folderName,
      isDeleted: false,
      fileType: 'folder'
    }
  });
  if (existing) return existing.id;
  const created = await prisma.userFile.create({
    data: {
      userId,
      parentId,
      fileName: folderName,
      fileType: 'folder'
    }
  });
  return created.id;
}

/**
 * VIP/管理员：将 ZIP 内指定文件解压到用户当前目录（网盘）
 * body: { parentId?: number | null, paths: string[] } — paths 为压缩包内**文件**路径（非目录）
 */
export const extractArchiveToDrive = async (req: AuthRequest, res: Response): Promise<void> => {
  let tempRoot: string | null = null;
  let zipfile: ZipFile | null = null;
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const allowed = await userCanExtractArchive(req.user.id);
    if (!allowed) {
      res.status(403).json({ success: false, message: '无在线解压权限（仅 VIP 与管理员）' });
      return;
    }

    const fileId = parseInt(req.params.id, 10);
    if (Number.isNaN(fileId)) {
      res.status(400).json({ success: false, message: '无效的文件ID' });
      return;
    }

    const rawParent = req.body?.parentId;
    const driveParentId =
      rawParent === undefined || rawParent === null || rawParent === 'root'
        ? null
        : parseInt(String(rawParent), 10);
    if (driveParentId !== null && Number.isNaN(driveParentId)) {
      res.status(400).json({ success: false, message: 'parentId 无效' });
      return;
    }

    const pathsIn = req.body?.paths;
    if (!Array.isArray(pathsIn) || pathsIn.length === 0) {
      res.status(400).json({ success: false, message: '请提供非空的 paths 数组（要解压的文件路径）' });
      return;
    }

    const uniquePaths = [...new Set(pathsIn.map((p: unknown) => posixNorm(String(p))))].filter(Boolean);
    if (uniquePaths.length === 0) {
      res.status(400).json({ success: false, message: 'paths 无效' });
      return;
    }

    const rawConflict = req.body?.conflictAction;
    const allowedConflict = new Set(['version', 'duplicate', 'suffix']);
    const conflictAction: RegisterLocalConflictAction = allowedConflict.has(String(rawConflict))
      ? (String(rawConflict) as RegisterLocalConflictAction)
      : 'suffix';
    if (uniquePaths.length > MAX_EXTRACT_FILES) {
      res.status(400).json({
        success: false,
        message: `单次最多解压 ${MAX_EXTRACT_FILES} 个文件`
      });
      return;
    }

    if (driveParentId !== null) {
      const parentFolder = await prisma.userFile.findFirst({
        where: {
          id: driveParentId,
          userId: req.user.id,
          fileType: 'folder',
          isDeleted: false
        }
      });
      if (!parentFolder) {
        res.status(404).json({ success: false, message: '目标文件夹不存在' });
        return;
      }
    }

    const userFile = await loadZipUserFile(fileId, req.user.id);
    if (!userFile || !userFile.storage) {
      res.status(404).json({ success: false, message: '文件不存在' });
      return;
    }

    if (!isZipLike(userFile)) {
      res.status(400).json({ success: false, message: '当前仅支持 ZIP 格式在线解压' });
      return;
    }

    const physicalPath = resolveStorageFilePath(userFile.storage.filePath);
    let srcStat;
    try {
      srcStat = await fs.stat(physicalPath);
    } catch {
      res.status(404).json({ success: false, message: '文件源已丢失' });
      return;
    }
    if (srcStat.size > MAX_SOURCE_ZIP_BYTES) {
      res.status(400).json({
        success: false,
        message: `压缩包过大（超过 ${Math.floor(MAX_SOURCE_ZIP_BYTES / 1024 / 1024)}MB）`
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { storageUsed: true, storageQuota: true }
    });
    if (!user) {
      res.status(404).json({ success: false, message: '用户不存在' });
      return;
    }

    zipfile = await openZip(physicalPath, false);
    const byPath = new Map<string, { entry: Entry; isDirectory: boolean; size: number }>();

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
        res.status(400).json({ success: false, message: 'paths 中请只传文件路径，不要传目录条目' });
        return;
      }
      const hit = byPath.get(w);
      if (!hit || hit.isDirectory) {
        res.status(400).json({ success: false, message: `压缩包中不存在文件: ${w}` });
        return;
      }
      totalBytes += hit.size;
      fileEntries.push({ relPath: w, entry: hit.entry, size: hit.size });
    }

    if (totalBytes > MAX_EXTRACT_TOTAL_BYTES) {
      res.status(400).json({
        success: false,
        message: `所选文件解压后总大小超过 ${Math.floor(MAX_EXTRACT_TOTAL_BYTES / 1024 / 1024)}MB`
      });
      return;
    }

    const need = user.storageUsed + BigInt(totalBytes);
    if (need > user.storageQuota) {
      res.status(400).json({ success: false, message: '存储空间不足，无法解压到网盘' });
      return;
    }

    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fm-zip-import-'));

    for (const { relPath, entry } of fileEntries) {
      const destAbs = path.join(tempRoot, relPath.split('/').join(path.sep));
      const rs = await openEntryReadStream(zipfile!, entry);
      await streamReadableToFile(rs, destAbs);
    }

    const relFiles = fileEntries.map((f) => f.relPath).sort();
    const dirRels = collectDirPathsFromFiles(relFiles);
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
          res.status(500).json({ success: false, message: '内部错误：父目录未创建' });
          return;
        }
        parentForCreate = id;
      }
      const fid = await getOrCreateFolder(req.user!.id, parentForCreate, seg);
      folderIdByRel.set(rel, fid);
    }

    let fileCount = 0;
    for (const relPath of relFiles) {
      const parentRel = path.posix.dirname(relPath);
      const base = path.posix.basename(relPath);
      const abs = path.join(tempRoot!, relPath.split('/').join(path.sep));
      const parentId =
        parentRel === '.' || parentRel === '' ? driveParentId : folderIdByRel.get(parentRel) ?? driveParentId;

      await registerLocalFileInDrive({
        absolutePath: abs,
        userId: req.user.id,
        parentId,
        logicalFileName: base,
        conflictAction
      });
      fileCount++;
    }

    await logOperation({
      req,
      userId: req.user.id,
      operationType: LogOperationType.UPLOAD,
      resourceType: LogResourceType.FILE,
      resourceId: userFile.id,
      description: `在线解压到网盘: ${userFile.fileName} (${fileCount} 个文件)`
    });

    res.json({
      success: true,
      message: `已解压 ${fileCount} 个文件到当前目录`,
      data: { fileCount, folderCount: dirRels.length }
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('非法的压缩包')) {
      res.status(400).json({ success: false, message: msg });
      return;
    }
    console.error('extractArchiveToDrive error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: '解压到网盘失败' });
    }
  } finally {
    if (zipfile?.isOpen) {
      zipfile.close();
    }
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    }
  }
};
