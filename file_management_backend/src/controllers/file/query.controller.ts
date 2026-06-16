import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import { open, stat } from 'fs/promises';
import archiver from 'archiver';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import prisma from '../../lib/prisma.js';
import { AuthRequest } from '../../types/index.js';
import { ensureDirectoryExists } from '../../utils/file.utils.js';
import { resolveStorageFilePath } from '../../utils/storagePath.utils.js';
import {
  computeSelectionRoots,
  loadParentChainMap,
  ObjectNotFoundError,
  sanitizeZipPathSegment
} from '../../utils/fileBatch.utils.js';
import { logOperation, LogOperationType, LogResourceType } from '../../services/logger.service.js';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';

// 尝试配置本地 FFmpeg 路径（如果存在）
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// 尝试配置 FFmpeg 路径
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// 备用：如果有本地特定路径，可以覆盖
// const localFfmpegPath = path.join(process.cwd(), 'ffmpeg', 'bin', 'ffmpeg.exe');
// if (fs.existsSync(localFfmpegPath)) {
//   ffmpeg.setFfmpegPath(localFfmpegPath);
// }

/** 按 MIME 大类筛选 FileStorage（仅适用于 file 类型条目） */
function storageWhereForMimeCategory(typeStr: string): Record<string, unknown> | null {
  switch (typeStr) {
    case 'image':
      return { mimeType: { startsWith: 'image/' } };
    case 'video':
      return { mimeType: { startsWith: 'video/' } };
    case 'audio':
      return { mimeType: { startsWith: 'audio/' } };
    case 'document':
      return {
        OR: [
          { mimeType: { startsWith: 'text/' } },
          { mimeType: { contains: 'pdf' } },
          { mimeType: { contains: 'word' } },
          { mimeType: { contains: 'excel' } },
          { mimeType: { contains: 'sheet' } },
          { mimeType: { contains: 'powerpoint' } },
          { mimeType: { contains: 'presentation' } },
          { mimeType: { contains: 'document' } }
        ]
      };
    case 'other':
      return {
        AND: [
          { mimeType: { not: { startsWith: 'image/' } } },
          { mimeType: { not: { startsWith: 'video/' } } },
          { mimeType: { not: { startsWith: 'audio/' } } },
          {
            NOT: {
              OR: [
                { mimeType: { startsWith: 'text/' } },
                { mimeType: { contains: 'pdf' } },
                { mimeType: { contains: 'word' } },
                { mimeType: { contains: 'excel' } },
                { mimeType: { contains: 'sheet' } },
                { mimeType: { contains: 'powerpoint' } },
                { mimeType: { contains: 'presentation' } },
                { mimeType: { contains: 'document' } }
              ]
            }
          }
        ]
      };
    default:
      return null;
  }
}

/**
 * 获取文件列表
 * 查询参数：parentId, isDeleted, q(文件名包含), type(image|video|...|all), entryKind(file|folder|all),
 * tagId, createdFrom, createdTo (ISO 日期或 YYYY-MM-DD)
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

    const { parentId, isDeleted, q, type, tagId: tagIdQuery, createdFrom, createdTo, entryKind } = req.query;

    const whereClause: any = {
      userId: req.user.id,
      isDeleted: isDeleted === 'true'
    };

    const tagIdNum =
      tagIdQuery !== undefined && tagIdQuery !== '' && tagIdQuery !== null
        ? parseInt(String(tagIdQuery), 10)
        : NaN;
    if (!isNaN(tagIdNum)) {
      whereClause.userFileTags = {
        some: {
          tagId: tagIdNum,
          tag: { userId: req.user.id }
        }
      };
    }

    const cf = createdFrom ? String(createdFrom).trim() : '';
    const ct = createdTo ? String(createdTo).trim() : '';
    if (cf || ct) {
      whereClause.createdAt = {};
      if (cf) {
        whereClause.createdAt.gte = new Date(cf);
      }
      if (ct) {
        const end = new Date(ct);
        end.setHours(23, 59, 59, 999);
        whereClause.createdAt.lte = end;
      }
    }

    if (q && String(q).trim()) {
      whereClause.fileName = {
        contains: String(q).trim()
      };
    }

    const ek = entryKind ? String(entryKind) : 'all';
    if (ek === 'file') {
      whereClause.fileType = 'file';
    } else if (ek === 'folder') {
      whereClause.fileType = 'folder';
    }

    const typeStr = type ? String(type) : 'all';
    const mimeWhere = typeStr !== 'all' ? storageWhereForMimeCategory(typeStr) : null;

    if (mimeWhere) {
      if (whereClause.fileType === 'folder') {
        whereClause.id = { in: [] };
      } else if (whereClause.fileType === 'file') {
        whereClause.storage = mimeWhere;
      } else {
        whereClause.AND = whereClause.AND || [];
        whereClause.AND.push({
          OR: [{ fileType: 'folder' }, { fileType: 'file', storage: mimeWhere }]
        });
      }
    }

    const isRecycle = isDeleted === 'true';
    if (!isRecycle) {
      const parentKeyPresent = Object.prototype.hasOwnProperty.call(req.query, 'parentId');
      if (parentKeyPresent) {
        const pv = parentId as string | undefined;
        whereClause.parentId =
          pv === '' || pv === undefined || pv === 'null' || pv === 'undefined'
            ? null
            : parseInt(String(pv), 10);
      } else if (typeStr === 'all') {
        whereClause.parentId = null;
      }
    }

    // 获取当前用户的文件列表
    const userFiles = await prisma.userFile.findMany({
      where: whereClause,
      include: {
        storage: {
          select: {
            fileSize: true,
            mimeType: true
          }
        },
        userFileTags: {
          include: {
            tag: true
          }
        }
      },
      orderBy: [
        { fileType: 'desc' }, // 'folder' > 'file', so desc puts folder first
        { createdAt: 'desc' }
      ]
    });

    const files = userFiles.map((file) => ({
      id: file.id,
      parentId: file.parentId, // 添加 parentId 映射
      fileName: file.fileName,
      fileType: file.fileType,
      fileSize: file.storage ? Number(file.storage.fileSize) : 0,
      mimeType: file.storage?.mimeType || (file.fileType === 'folder' ? 'folder' : 'unknown'),
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      isDeleted: file.isDeleted,
      tags: file.userFileTags.map((u) => ({
        id: u.tag.id,
        tagName: u.tag.tagName,
        color: u.tag.color
      }))
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
 * 检查文件名是否存在
 */
export const checkFileName = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { parentId, fileName, type = 'file' } = req.body;
    console.log('parentId',parentId);
    console.log('fileName',fileName);
    console.log('type',type);
    if (!fileName) {
      res.status(400).json({ success: false, message: '文件名不能为空' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    let params={
      userId: req.user.id,
      parentId: parentId ? parseInt(parentId) : null,
      fileName: fileName,
      isDeleted: false,
      fileType: type as any
    }
    console.log('params',params);

    const exists = await prisma.userFile.findFirst({
      where: params
    });

    res.json({
      success: true,
      exists: !!exists
    });

  } catch (error) {
    console.error('Check filename error:', error);
    res.status(500).json({ success: false, message: '检查文件名失败' });
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
        },
        userFileTags: {
          include: {
            tag: true
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
        parentId: userFile.parentId,
        fileName: userFile.fileName,
        fileType: userFile.fileType,
        fileSize: userFile.storage ? Number(userFile.storage.fileSize) : 0,
        mimeType: userFile.storage?.mimeType || 'unknown',
        createdAt: userFile.createdAt,
        updatedAt: userFile.updatedAt,
        tags: userFile.userFileTags.map((u) => ({
          id: u.tag.id,
          tagName: u.tag.tagName,
          color: u.tag.color
        }))
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

    const physicalPath = resolveStorageFilePath(userFile.storage.filePath);

    // 检查物理文件是否存在
    if (!fs.existsSync(physicalPath)) {
      res.status(404).json({
        success: false,
        message: '文件已被删除'
      });
      return;
    }

    // 设置响应头
    const isPreview = req.query.preview === 'true';
    const disposition = isPreview ? 'inline' : 'attachment';

    // 根据后缀名修正 mimeType（有时数据库存的是 application/octet-stream）
    let contentType = userFile.storage.mimeType;
    const ext = path.extname(userFile.fileName).toLowerCase();
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

    // 如果是文本文件预览，强制指定 utf-8 编码，防止中文乱码
    if (isPreview && (contentType.startsWith('text/') || ext === '.txt' || ext === '.md' || ext === '.json' || ext === '.js' || ext === '.css' || ext === '.html')) {
      if (!contentType.includes('charset')) {
        contentType += '; charset=utf-8';
      }
    }

    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(userFile.fileName)}"`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes'); // 显式声明支持 Range

    // 记录下载日志
    await logOperation({
      req,
      userId: req.user!.id,
      operationType: LogOperationType.DOWNLOAD,
      resourceType: LogResourceType.FILE,
      resourceId: userFile.id,
      description: `Downloaded file: ${userFile.fileName}`
    });

    // 发送文件
    res.sendFile(physicalPath);
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({
      success: false,
      message: '文件下载失败'
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

    const physicalPath = resolveStorageFilePath(userFile.storage.filePath);

    // 检查是否为图片或视频
    const mimeType = userFile.storage.mimeType.toLowerCase();
    const fileName = userFile.fileName.toLowerCase();

    // 支持更多扩展名
    const isImage = mimeType.startsWith('image/') ||
      /\.(jpg|jpeg|png|gif|webp|bmp|tif|tiff|svg)$/i.test(fileName);

    // 排除 audio 类型，并从列表中移除 ogg
    const isVideo = (mimeType.startsWith('video/') ||
      /\.(mp4|webm|mov|wmv|flv|avi|rmvb|mkv|3gp|asf|m4v)$/i.test(fileName)) &&
      !mimeType.startsWith('audio/');

    if (!isImage && !isVideo) {
      // console.warn(`Thumbnail not supported for: ${fileName} (${mimeType})`);
      res.status(400).json({
        success: false,
        message: '不支持该文件类型的缩略图'
      });
      return;
    }

    // 检查物理文件是否存在
    if (!fs.existsSync(physicalPath)) {
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
      if (isImage) {
        // 图片处理
        await sharp(physicalPath)
          .resize(200, 200, {
            fit: 'cover',
            position: 'center'
          })
          .webp({ quality: 80 })
          .toFile(thumbnailPath);
      } else if (isVideo) {
        // 视频处理
        const tempThumbName = `${userFile.storage!.fileHash}-temp.jpg`;
        const tempThumbPath = path.join(thumbnailsDir, tempThumbName);

        try {
          await new Promise((resolve, reject) => {
            ffmpeg(physicalPath)
              .seekInput('00:00:05')
              .frames(1)
              .on('end', () => resolve(true))
              .on('error', (err) => {
                reject(err);
              })
              .save(tempThumbPath);
          });
        } catch (ffmpegErr) {
          // 尝试失败，回退到不Seek直接截取第一帧
          try {
            await new Promise((resolve, reject) => {
              ffmpeg(physicalPath)
                .frames(1)
                .on('end', resolve)
                .on('error', reject)
                .save(tempThumbPath);
            });
          } catch (e) {
            console.warn(`[Thumbnail] Failed to extract video frame for file ${userFile.id} (${userFile.fileName}). Is it a valid video?`);
          }
        }

        // 检查生成的临时文件并转换为 webp
        if (fs.existsSync(tempThumbPath)) {
          await sharp(tempThumbPath)
            .resize(200, 200, { fit: 'cover' })
            .webp({ quality: 80 })
            .toFile(thumbnailPath);
          fs.unlinkSync(tempThumbPath);
        } else {
          throw new Error('无法生成视频预览图');
        }
      }

      // 再次检查生成的文件是否存在
      if (fs.existsSync(thumbnailPath)) {
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.sendFile(thumbnailPath);
      } else {
        throw new Error('生成的缩略图文件不存在');
      }
    } catch (genError: any) {
      // 优化错误日志，避免无效视频文件刷屏
      const msg = genError.message || '';
      if (msg.includes('ffmpeg') || msg === '无法生成视频预览图' || msg === '生成的缩略图文件不存在') {
        console.warn(`[Thumbnail] Generation failed for file ${req.params.id}: ${msg.split('\n')[0]}`);
      } else {
        console.error('Thumbnail generation error:', genError);
      }
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

/**
 * 预览 Office 文档
 * 将 Office 文件（doc/docx/xls/xlsx/ppt/pptx）转换为 PDF 后返回
 * 转换结果会被缓存，相同文件不会重复转换
 */
export const previewFile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const fileId = parseInt(req.params.id);
    if (isNaN(fileId)) {
      res.status(400).json({ success: false, message: '无效的文件ID' });
      return;
    }

    // 查询文件信息
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
      res.status(404).json({ success: false, message: '文件不存在' });
      return;
    }

    const physicalPath = resolveStorageFilePath(userFile.storage.filePath);

    // 检查是否为支持的 Office 文件类型
    const { isOfficeFile, convertToPdf, checkLibreOfficeInstallation, isPreviewQueueAvailable } = await import('../../services/preview.service.js');

    if (!isOfficeFile(userFile.fileName)) {
      res.status(400).json({ success: false, message: '该文件类型不支持 Office 预览' });
      return;
    }

    // 队列可用时由 Worker 转码，API 容器无需本机 LibreOffice
    const installation = checkLibreOfficeInstallation();
    if (!installation.installed && !isPreviewQueueAvailable()) {
      res.status(500).json({
        success: false,
        message: 'LibreOffice 未安装，无法进行文档预览。请联系管理员安装 LibreOffice。'
      });
      return;
    }

    // 检查源文件是否存在
    if (!fs.existsSync(physicalPath)) {
      res.status(404).json({ success: false, message: '文件源已丢失' });
      return;
    }

    // 执行转换；PPT/ODP 可能先只出前 N 页 PDF，全文在后台继续转
    const { path: pdfPath, phase: pdfPhase } = await convertToPdf(physicalPath, userFile.storage.fileHash);

    // 记录预览日志
    await logOperation({
      req,
      userId: req.user!.id,
      operationType: LogOperationType.DOWNLOAD,
      resourceType: LogResourceType.FILE,
      resourceId: userFile.id,
      description: `Previewed office file: ${userFile.fileName}`
    });

    // 返回 PDF 文件流（partial 为快速稿，可随后刷新在全文生成后走完整稿）
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(userFile.fileName.replace(/\.\w+$/, '.pdf'))}"`);
    res.setHeader('X-Preview-Pdf-Phase', pdfPhase);
    // 确保跨域 iframe 可嵌入（与 createApp helmet frame-ancestors 一致）
    res.removeHeader('X-Frame-Options');
    if (pdfPhase === 'partial') {
      // 快览 PDF 别进浏览器磁盘缓存，减少一直钉在 25 页的概率。
      res.setHeader('Cache-Control', 'private, no-store');
    } else {
      // 24 小时内可直接用强缓存，少打服务器
      res.setHeader('Cache-Control', 'public, max-age=86400');
       // 全文可缓存，且标识是 full，不是快览
       // 若之前缓存的是 partial（理想上 partial 已 no-store，不应长期留着）
       // 若带的是旧 ETag，与新的 "hash-full" 不一致 → 200 + 新 PDF，而不是错误 304
      res.setHeader('ETag', `"${userFile.storage.fileHash}-full"`);
    }
    res.sendFile(path.resolve(pdfPath));
  } catch (error: any) {
    console.error('[Preview] Error:', error);
    res.status(500).json({
      success: false,
      message: `文档预览失败: ${error.message || '未知错误'}`
    });
  }
};

/**
 * 查询 Office 预览状态：磁盘阶段 + BullMQ 任务状态（不触发转换）
 * 供前端轮询 partial→full 刷新 iframe，以及展示排队/转换中/失败（任务 5.4）
 */
export const getOfficePreviewState = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }
    const fileId = parseInt(req.params.id, 10);
    if (isNaN(fileId)) {
      res.status(400).json({ success: false, message: '无效的文件ID' });
      return;
    }
    const userFile = await prisma.userFile.findFirst({
      where: { id: fileId, userId: req.user.id, isDeleted: false },
      include: { storage: { select: { filePath: true, fileHash: true } } }
    });
    if (!userFile || !userFile.storage) {
      res.status(404).json({ success: false, message: '文件不存在' });
      return;
    }
    const { isOfficeFile, getPreviewFilePhase, getPptPreviewFirstSlideCount, getPreviewQueueStatus, getAvailablePartialSlides, ensurePartialBatchScheduled } =
      await import('../../services/preview.service.js');
    if (!isOfficeFile(userFile.fileName)) {
      res.status(400).json({ success: false, message: '该文件类型无预览状态' });
      return;
    }
    const fileHash = userFile.storage.fileHash;
    const physicalPath = (await import('../../utils/storagePath.utils.js')).resolveStorageFilePath(
      userFile.storage.filePath,
    );
    await ensurePartialBatchScheduled(fileHash, physicalPath);
    const [phase, queueStatus] = await Promise.all([
      Promise.resolve(getPreviewFilePhase(fileHash)),
      getPreviewQueueStatus(fileHash),
    ]);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const availableSlides = getAvailablePartialSlides(fileHash);
    // 状态轮询须每次 200，禁用 Express 默认 ETag 304
    res.setHeader(
      'ETag',
      `"preview-state-${fileHash}-${phase}-${availableSlides ?? 0}-${queueStatus.nextBatchTarget ?? 0}-${queueStatus.jobs.partialMore.state}"`,
    );
    res.json({
      success: true,
      phase,
      firstSlides: getPptPreviewFirstSlideCount(),
      availableSlides,
      nextBatchTarget: queueStatus.nextBatchTarget,
      queueAvailable: queueStatus.queueAvailable,
      jobs: queueStatus.jobs,
    });
  } catch (error: any) {
    console.error('[Preview state] Error:', error);
    res.status(500).json({ success: false, message: error.message || '查询失败' });
  }
};

/** 与 download 中文本预览白名单一致，用于分块读取 */
function isTextLikeFileForChunk(ext: string, contentType: string): boolean {
  if (contentType.startsWith('text/')) return true;
  return (
    ext === '.txt' ||
    ext === '.md' ||
    ext === '.json' ||
    ext === '.js' ||
    ext === '.css' ||
    ext === '.html' ||
    ext === '.ts' ||
    ext === '.log' ||
    ext === '.csv' ||
    ext === '.xml'
  );
}

/**
 * 返回从 buf 开头起、在 [0, n) 内可完整解码为 UTF-8 的字节数，避免在码点中间截断产生 � / 乱码。
 * 若 n 处落在多字节字符内部，会停在**该字符开始之前**的偏移。
 */
function utf8CompletePrefixLength(buf: Buffer, n: number): number {
  n = Math.min(n, buf.length);
  let i = 0;
  while (i < n) {
    const c = buf[i]!;
    if (c <= 0x7f) {
      i += 1;
    } else if ((c & 0xe0) === 0xc0) {
      if (i + 2 > n) return i;
      if ((buf[i + 1]! & 0xc0) !== 0x80) {
        i += 1;
        continue;
      }
      i += 2;
    } else if ((c & 0xf0) === 0xe0) {
      if (i + 3 > n) return i;
      if ((buf[i + 1]! & 0xc0) !== 0x80 || (buf[i + 2]! & 0xc0) !== 0x80) {
        i += 1;
        continue;
      }
      i += 3;
    } else if ((c & 0xf8) === 0xf0) {
      if (i + 4 > n) return i;
      if ((buf[i + 1]! & 0xc0) !== 0x80 || (buf[i + 2]! & 0xc0) !== 0x80 || (buf[i + 3]! & 0xc0) !== 0x80) {
        i += 1;
        continue;
      }
      if (c > 0xf4) {
        i += 1;
        continue;
      }
      i += 4;
    } else {
      i += 1;
    }
  }
  return i;
}

type TextChunkFileEncoding = 'utf-8' | 'gb18030';

const textChunkEncodingCache = new Map<string, TextChunkFileEncoding>();

function textChunkCacheKey(userId: number, fileId: number): string {
  return `${userId}:${fileId}`;
}

function mapQueryToChunkEncoding(
  s: string | string[] | undefined
): TextChunkFileEncoding | null {
  if (s == null) return null;
  const u = (Array.isArray(s) ? s[0] : s).toLowerCase();
  if (u === 'utf-8' || u === 'utf8') return 'utf-8';
  if (u === 'gbk' || u === 'gb18030' || u === 'gb2312' || u === 'gb_2312') return 'gb18030';
  return null;
}

/** 用文件头样例探测；中文小说常见为 GBK/GB18030，与 UTF-8 误辨时用替换符数比较 */
function detectTextFileEncodingFromBuffer(buf: Buffer): TextChunkFileEncoding {
  if (buf.length === 0) return 'utf-8';
  const d = jschardet.detect(buf);
  const enc = d?.encoding?.toUpperCase() || '';
  const conf = d?.confidence ?? 0;
  if (enc) {
    if (enc.includes('GB') || enc === 'EUC-CN' || enc === 'HZ-GB-2312') {
      if (conf >= 0.3) return 'gb18030';
    }
    if (enc === 'UTF-8' || enc === 'UTF8' || enc === 'ASCII' || enc === 'ISO-8859-1') {
      if (enc === 'UTF-8' && conf >= 0.6) {
        if (utf8CompletePrefixLength(buf, buf.length) === buf.length) {
          const t = buf.toString('utf8');
          if (!t.includes('\uFFFD')) return 'utf-8';
        }
      } else if (enc === 'ASCII' && conf >= 0.4) {
        return 'utf-8';
      }
    }
  }
  const sUtf8 = buf.toString('utf8');
  const badU8 = (sUtf8.match(/\uFFFD/g) || []).length;
  const sGb = iconv.decode(buf, 'gb18030');
  const badGb = (sGb.match(/\uFFFD/g) || []).length;
  if (badGb < badU8) return 'gb18030';
  if (badU8 === 0 && utf8CompletePrefixLength(buf, buf.length) === buf.length) return 'utf-8';
  return badU8 < badGb ? 'utf-8' : 'gb18030';
}

/** 非 UTF-8 时按码元对齐截断，避免在双字节/四字节字中间截断；尽量无 U+FFFD 的最长前缀 */
function gb18030CompletePrefixLength(buf: Buffer, n: number): number {
  n = Math.min(n, buf.length);
  for (let k = 0; k < 4; k++) {
    const len = n - k;
    if (len <= 0) return 0;
    const sub = buf.subarray(0, len);
    try {
      const t = iconv.decode(sub, 'gb18030');
      if (t.includes('\uFFFD')) continue;
      const back = iconv.encode(t, 'gb18030');
      if (back.length === sub.length && back.equals(sub)) return len;
    } catch {
      // ignore
    }
  }
  return n;
}

function rawCompletePrefixLength(data: Buffer, fileEnc: TextChunkFileEncoding): number {
  if (fileEnc === 'utf-8') return utf8CompletePrefixLength(data, data.length);
  return gb18030CompletePrefixLength(data, data.length);
}

const TEXT_CHUNK_MAX = 1024 * 1024; // 单次最多读 1MB
const TEXT_CHUNK_DEFAULT = 256 * 1024; // 默认 256KB

/**
 * 大文本分块读取（按字节 offset，仅在完整 UTF-8 码点边界处截断，避免分块接合处出现乱码）
 * GET /api/files/:id/text-chunk?offset=0&maxBytes=262144
 */
export const getTextFileChunk = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }
    const fileId = parseInt(req.params.id, 10);
    if (isNaN(fileId)) {
      res.status(400).json({ success: false, message: '无效的文件ID' });
      return;
    }
    const offsetRaw = req.query.offset;
    const maxBytesRaw = req.query.maxBytes;
    let offset = offsetRaw == null || offsetRaw === '' ? 0 : parseInt(String(offsetRaw), 10);
    let maxBytes = maxBytesRaw == null || maxBytesRaw === '' ? TEXT_CHUNK_DEFAULT : parseInt(String(maxBytesRaw), 10);
    if (Number.isNaN(offset) || offset < 0) offset = 0;
    if (Number.isNaN(maxBytes) || maxBytes < 1024) maxBytes = TEXT_CHUNK_DEFAULT;
    if (maxBytes > TEXT_CHUNK_MAX) maxBytes = TEXT_CHUNK_MAX;

    const userFile = await prisma.userFile.findFirst({
      where: { id: fileId, userId: req.user.id, isDeleted: false },
      include: {
        storage: { select: { filePath: true, mimeType: true, fileSize: true } }
      }
    });
    if (!userFile || !userFile.storage) {
      res.status(404).json({ success: false, message: '文件不存在' });
      return;
    }
    const ext = path.extname(userFile.fileName).toLowerCase();
    const contentType = (userFile.storage.mimeType || '').toLowerCase();
    if (!isTextLikeFileForChunk(ext, contentType)) {
      res.status(400).json({ success: false, message: '该文件类型不支持分块文本预览' });
      return;
    }
    if (ext === '.pdf' || contentType === 'application/pdf') {
      res.status(400).json({ success: false, message: 'PDF 请使用全量或 PDF 阅读器' });
      return;
    }

    const physicalPath = resolveStorageFilePath(userFile.storage.filePath);
    if (!fs.existsSync(physicalPath)) {
      res.status(404).json({ success: false, message: '文件已被删除' });
      return;
    }

    const st = await stat(physicalPath);
    const totalSize = st.size;
    if (offset >= totalSize) {
      res.json({
        success: true,
        data: { text: '', nextOffset: totalSize, totalSize, done: true }
      });
      return;
    }

    const handle = await open(physicalPath, 'r');
    try {
      const encQ = req.query.encoding;
      const qenc = mapQueryToChunkEncoding(
        typeof encQ === 'string' ? encQ : Array.isArray(encQ) && typeof encQ[0] === 'string' ? encQ[0] : undefined
      );
      const ck = textChunkCacheKey(req.user.id, fileId);
      let fileEnc: TextChunkFileEncoding = 'utf-8';

      if (qenc) {
        fileEnc = qenc;
        textChunkEncodingCache.set(ck, fileEnc);
      } else if (textChunkEncodingCache.has(ck)) {
        fileEnc = textChunkEncodingCache.get(ck)!;
      } else if (offset > 0) {
        const headLen = Math.min(65536, totalSize);
        const headBuf = Buffer.alloc(headLen);
        const hr = await handle.read(headBuf, 0, headLen, 0);
        fileEnc = detectTextFileEncodingFromBuffer(headBuf.subarray(0, hr.bytesRead));
        textChunkEncodingCache.set(ck, fileEnc);
      }

      const toRead = Math.min(maxBytes, totalSize - offset);
      const buf = Buffer.alloc(toRead);
      const result = await handle.read(buf, 0, toRead, offset);
      let data = buf.subarray(0, result.bytesRead);

      if (offset === 0 && !qenc && !textChunkEncodingCache.has(ck)) {
        const sample = data.length > 65536 ? data.subarray(0, 65536) : data;
        fileEnc = detectTextFileEncodingFromBuffer(sample);
        textChunkEncodingCache.set(ck, fileEnc);
      }

      let useLen = rawCompletePrefixLength(data, fileEnc);
      const maxTail = 3;
      let added = 0;
      while (useLen === 0 && data.length > 0 && added < maxTail && offset + data.length < totalSize) {
        const one = Buffer.alloc(1);
        const r2 = await handle.read(one, 0, 1, offset + data.length);
        if (r2.bytesRead === 0) break;
        added += 1;
        data = Buffer.concat([data, one.subarray(0, 1)]);
        useLen = rawCompletePrefixLength(data, fileEnc);
      }
      if (useLen === 0 && data.length > 0) {
        useLen = data.length;
      }

      const slice = data.subarray(0, useLen);
      let text: string;
      if (fileEnc === 'utf-8') {
        text = slice.toString('utf8');
        if (offset === 0 && text.length > 0 && text.charCodeAt(0) === 0xfeff) {
          text = text.slice(1);
        }
      } else {
        text = iconv.decode(slice, 'gb18030');
      }

      const nextOffset = offset + useLen;
      res.json({
        success: true,
        data: {
          text,
          nextOffset,
          totalSize,
          done: nextOffset >= totalSize,
          fileEncoding: fileEnc
        }
      });
    } finally {
      await handle.close();
    }
  } catch (error) {
    console.error('[TextChunk] Error:', error);
    res.status(500).json({ success: false, message: '读取文本分块失败' });
  }
};

/** 顶层选中项数量上限；展开文件夹后的文件数上限 */
const BATCH_ZIP_MAX_TOP_IDS = 200;
const BATCH_ZIP_MAX_FILE_ENTRIES = 500;

type ZipBuildEntry = { kind: 'file'; abs: string; zipPath: string } | { kind: 'dir'; zipPath: string };

async function buildZipEntriesForRoots(
  userId: number,
  rootIds: number[],
  maxFiles: number
): Promise<ZipBuildEntry[]> {
  const used = new Set<string>();
  const out: ZipBuildEntry[] = [];
  let fileCount = 0;

  const allocPath = (p: string): string => {
    const norm = p.replace(/\\/g, '/');
    let z = norm;
    let n = 0;
    while (used.has(z.toLowerCase())) {
      n += 1;
      if (z.endsWith('/')) {
        const d = z.replace(/\/$/, '');
        const ext = path.extname(d);
        const stem = path.basename(d, ext);
        const parent = path.posix.dirname(d);
        z =
          parent === '.' || parent === ''
            ? `${stem} (${n})/`
            : `${parent}/${stem} (${n})/`;
      } else {
        const ext = path.extname(z);
        const stem = path.basename(z, ext);
        const parent = path.posix.dirname(z);
        z =
          parent === '.' || parent === ''
            ? `${stem} (${n})${ext}`
            : `${parent}/${stem} (${n})${ext}`;
      }
    }
    used.add(z.toLowerCase());
    return z;
  };

  const walkFolder = async (folderId: number, prefix: string): Promise<void> => {
    const children = await prisma.userFile.findMany({
      where: { userId, parentId: folderId, isDeleted: false },
      orderBy: [{ fileType: 'desc' }, { fileName: 'asc' }],
      include: {
        storage: { select: { filePath: true } }
      }
    });
    const pref = prefix.replace(/\/$/, '');
    if (children.length === 0) {
      const dirPath = allocPath(`${pref}/`);
      out.push({ kind: 'dir', zipPath: dirPath });
      return;
    }
    for (const ch of children) {
      const seg = sanitizeZipPathSegment(ch.fileName);
      const rel = pref ? `${pref}/${seg}` : seg;
      if (ch.fileType === 'folder') {
        await walkFolder(ch.id, rel);
      } else {
        if (fileCount >= maxFiles) {
          throw new Error(`ZIP_FILE_LIMIT:${maxFiles}`);
        }
        if (!ch.storage?.filePath) {
          throw new Error(`MISSING_STORAGE:${ch.fileName}`);
        }
        const abs = resolveStorageFilePath(ch.storage.filePath);
        if (!fs.existsSync(abs)) {
          throw new Error(`MISSING_DISK:${ch.fileName}`);
        }
        fileCount += 1;
        out.push({ kind: 'file', abs, zipPath: allocPath(rel) });
      }
    }
  };

  const roots = await prisma.userFile.findMany({
    where: { id: { in: rootIds }, userId, isDeleted: false },
    orderBy: { id: 'asc' },
    include: {
      storage: { select: { filePath: true } }
    }
  });
  if (roots.length !== rootIds.length) {
    throw new Error('ROOT_MISMATCH');
  }

  for (const r of roots) {
    const seg = sanitizeZipPathSegment(r.fileName);
    if (r.fileType === 'file') {
      if (fileCount >= maxFiles) {
        throw new Error(`ZIP_FILE_LIMIT:${maxFiles}`);
      }
      if (!r.storage?.filePath) {
        throw new Error(`MISSING_STORAGE:${r.fileName}`);
      }
      const abs = resolveStorageFilePath(r.storage.filePath);
      if (!fs.existsSync(abs)) {
        throw new Error(`MISSING_DISK:${r.fileName}`);
      }
      fileCount += 1;
      out.push({ kind: 'file', abs, zipPath: allocPath(seg) });
    } else {
      await walkFolder(r.id, seg);
    }
  }

  return out;
}

/**
 * POST /api/files/batch/download-zip
 * 将选中的文件与文件夹（文件夹递归）打包为 ZIP 流式下载
 */
export const downloadBatchAsZip = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证'
      });
      return;
    }

    const raw = (req.body as { ids?: unknown }).ids;
    if (!Array.isArray(raw) || raw.length === 0) {
      res.status(400).json({
        success: false,
        message: '请提供有效的文件 id 列表'
      });
      return;
    }

    const ids = [...new Set(raw.map((x) => Number(x)).filter((n) => !Number.isNaN(n) && n > 0))];
    if (ids.length === 0) {
      res.status(400).json({
        success: false,
        message: '请提供有效的文件 id 列表'
      });
      return;
    }

    if (ids.length > BATCH_ZIP_MAX_TOP_IDS) {
      res.status(400).json({
        success: false,
        message: `单次最多选择 ${BATCH_ZIP_MAX_TOP_IDS} 个顶层项`
      });
      return;
    }

    const userId = req.user.id;

    const initialRows = await prisma.userFile.findMany({
      where: {
        id: { in: ids },
        userId,
        isDeleted: false
      },
      select: { id: true }
    });
    if (initialRows.length !== ids.length) {
      res.status(400).json({
        success: false,
        message: '部分文件不存在或已删除'
      });
      return;
    }

    let pmap: Map<number, number | null>;
    try {
      pmap = await loadParentChainMap(ids, userId);
    } catch (e) {
      if (e instanceof ObjectNotFoundError) {
        res.status(400).json({ success: false, message: '路径数据不完整，请重试' });
        return;
      }
      throw e;
    }

    const rootIds = computeSelectionRoots(ids, pmap).sort((a, b) => a - b);

    let zipEntries: ZipBuildEntry[];
    try {
      zipEntries = await buildZipEntriesForRoots(userId, rootIds, BATCH_ZIP_MAX_FILE_ENTRIES);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.startsWith('ZIP_FILE_LIMIT:')) {
        res.status(400).json({
          success: false,
          message: `压缩包内文件数量超过上限（${BATCH_ZIP_MAX_FILE_ENTRIES}）`
        });
        return;
      }
      if (msg.startsWith('MISSING_DISK:')) {
        const name = msg.split(':')[1] ?? '';
        res.status(404).json({ success: false, message: `文件在磁盘上不存在：${name}` });
        return;
      }
      if (msg.startsWith('MISSING_STORAGE:')) {
        const name = msg.split(':')[1] ?? '';
        res.status(404).json({ success: false, message: `存储记录缺失：${name}` });
        return;
      }
      if (msg === 'ROOT_MISMATCH') {
        res.status(400).json({ success: false, message: '选中项数据不一致，请刷新后重试' });
        return;
      }
      throw e;
    }

    const filePieces = zipEntries.filter((e) => e.kind === 'file');
    if (filePieces.length === 0 && zipEntries.every((e) => e.kind === 'dir')) {
      // 仅空目录：仍生成 zip
    } else if (filePieces.length === 0) {
      res.status(400).json({ success: false, message: '没有可打包的文件' });
      return;
    }

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (err: Error & { code?: string }) => {
      if (err.code === 'ENOENT') {
        console.warn('[batch-zip]', err);
      } else {
        console.error('[batch-zip]', err);
      }
    });
    archive.on('error', (err: Error) => {
      console.error('[batch-zip] archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: '打包失败'
        });
      } else {
        res.end();
      }
    });

    const safeTs = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipName = `batch-download-${safeTs}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(zipName)}"; filename*=UTF-8''${encodeURIComponent(zipName)}`
    );

    archive.pipe(res);

    try {
      await logOperation({
        req,
        userId: req.user!.id,
        operationType: LogOperationType.DOWNLOAD,
        resourceType: LogResourceType.FILE,
        resourceId: rootIds[0]!,
        description: `Batch zip download (${filePieces.length} files)`
      });
    } catch (logErr) {
      console.error('[batch-zip] logOperation:', logErr);
    }

    for (const e of zipEntries) {
      if (e.kind === 'file') {
        archive.file(e.abs, { name: e.zipPath });
      } else {
        archive.append(Buffer.alloc(0), { name: e.zipPath });
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('downloadBatchAsZip error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: '打包下载失败'
      });
    }
  }
};
