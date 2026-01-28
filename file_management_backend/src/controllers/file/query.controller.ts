import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import prisma from '../../lib/prisma.js';
import { AuthRequest } from '../../types/index.js';
import { ensureDirectoryExists } from '../../utils/file.utils.js';
import { logOperation, LogOperationType, LogResourceType } from '../../services/logger.service.js';

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

    const { parentId, isDeleted } = req.query;

    // 获取当前用户的文件列表
    const userFiles = await prisma.userFile.findMany({
      where: { 
        userId: req.user.id,
        parentId: parentId ? parseInt(parentId as string) : null,
        isDeleted: isDeleted === 'true'
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

    // 检查是否为图片或视频
    const mimeType = userFile.storage.mimeType.toLowerCase();
    const fileName = userFile.fileName.toLowerCase();
    
    // 支持更多扩展名
    const isImage = mimeType.startsWith('image/') || 
                    /\.(jpg|jpeg|png|gif|webp|bmp|tif|tiff|svg)$/i.test(fileName);
    
    const isVideo = mimeType.startsWith('video/') || 
                    /\.(mp4|webm|ogg|mov|wmv|flv|avi|rmvb|mkv|3gp|asf|m4v)$/i.test(fileName);

    if (!isImage && !isVideo) {
        console.warn(`Thumbnail not supported for: ${fileName} (${mimeType})`);
        res.status(400).json({
            success: false,
            message: '不支持该文件类型的缩略图'
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
      if (isImage) {
        // 图片处理
        await sharp(userFile.storage.filePath)
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
            ffmpeg(userFile.storage!.filePath)
              .screenshots({
                timestamps: ['00:00:05'], // 5秒处，更稳健
                filename: tempThumbName,
                folder: thumbnailsDir,
                size: '200x200'
              })
              .on('end', () => resolve(true))
              .on('error', (err) => {
                reject(err);
              });
          });
        } catch (ffmpegErr) {
          // 尝试第1秒
          await new Promise((resolve, reject) => {
             ffmpeg(userFile.storage!.filePath)
               .screenshots({
                 timestamps: ['00:00:01'], 
                 filename: tempThumbName,
                 folder: thumbnailsDir,
                 size: '200x200'
               })
               .on('end', resolve)
               .on('error', reject);
          });
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
    } catch (genError) {
      console.error('Thumbnail generation error:', genError);
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
