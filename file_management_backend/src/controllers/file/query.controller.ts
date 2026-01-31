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

    const { parentId, isDeleted, q, type } = req.query;

    const whereClause: any = {
      userId: req.user.id,
      isDeleted: isDeleted === 'true'
    };

    if (q) {
      whereClause.fileName = {
        contains: q as string
      };
    } else if (type && type !== 'all') {
      const typeStr = type as string;
      if (typeStr === 'image') {
        whereClause.storage = { mimeType: { startsWith: 'image/' } };
      } else if (typeStr === 'video') {
        whereClause.storage = { mimeType: { startsWith: 'video/' } };
      } else if (typeStr === 'audio') {
        whereClause.storage = { mimeType: { startsWith: 'audio/' } };
      } else if (typeStr === 'document') {
        whereClause.storage = {
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
      }
    } else {
      // 如果不是查询回收站（即查询正常文件），则必须添加 parentId 过滤
      if (isDeleted !== 'true') {
        whereClause.parentId = parentId ? parseInt(parentId as string) : null;
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
        }
      },
      orderBy: [
        { fileType: 'desc' }, // 'folder' > 'file', so desc puts folder first
        { createdAt: 'desc' }
      ]
    });

    const files = userFiles.map(file => ({
      id: file.id,
      parentId: file.parentId, // 添加 parentId 映射
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
 * 检查文件名是否存在
 */
export const checkFileName = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
     const { parentId, fileName, type = 'file' } = req.body;
     
     if (!fileName) {
         res.status(400).json({ success: false, message: '文件名不能为空' });
         return;
     }

     if (!req.user) {
         res.status(401).json({ success: false, message: '未认证' });
         return;
     }

     const exists = await prisma.userFile.findFirst({
         where: {
             userId: req.user.id,
             parentId: parentId ? parseInt(parentId) : null,
             fileName: fileName,
             isDeleted: false,
             fileType: type as any
         }
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
               ffmpeg(userFile.storage!.filePath)
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
