import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import prisma from '../../lib/prisma.js';
import { AuthRequest } from '../../types/index.js';
import { ensureDirectoryExists } from '../../utils/file.utils.js';

// 尝试配置本地 FFmpeg 路径（如果存在）
const localFfmpegPath = path.join(process.cwd(), 'ffmpeg', 'bin', 'ffmpeg.exe');
if (fs.existsSync(localFfmpegPath)) {
  ffmpeg.setFfmpegPath(localFfmpegPath);
}

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
    const isImage = userFile.storage.mimeType.startsWith('image/');
    const isVideo = userFile.storage.mimeType.startsWith('video/') || userFile.fileName.toLowerCase().endsWith('.rmvb');

    if (!isImage && !isVideo) {
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
      if (userFile.storage.mimeType.startsWith('image/')) {
        await sharp(userFile.storage.filePath)
          .resize(200, 200, {
            fit: 'cover',
            position: 'center'
          })
          .webp({ quality: 80 })
          .toFile(thumbnailPath);
      } else if (userFile.storage.mimeType.startsWith('video/') || userFile.fileName.toLowerCase().endsWith('.rmvb')) {
        // 视频缩略图处理
        await new Promise((resolve, reject) => {
          ffmpeg(userFile.storage.filePath)
            .screenshots({
              timestamps: ['10'], // 截取第10秒，如果视频短于10秒，ffmpeg通常会截取最后一帧或报错，需要考虑到
              filename: thumbnailName,
              folder: thumbnailsDir,
              size: '200x200' // 自动保持比例缩放
            })
            .on('end', () => resolve(true))
            .on('error', (err) => reject(err));
        });
        
        // ffmpeg 生成的文件名可能没有完全按照预期（有时候会追加 _1.png 等），
        // 但 screenshots 选项指定 filename 时通常是准确的。
        // 不过 screenshots 生成的是 png/jpg，我们需要确认 output format。
        // 这里为了简单，假设 userFile.storage.filePath 是源，生成的是 .png 或 .jpg。
        // 我们的 thumbnailName 是 .webp。FFmpeg直接生成webp可能需要特定配置。
        // 为了稳健，我们先生成 .jpg 中间文件，再转 webp，或者直接生成 jpg 并重命名。
        // 简化策略：让 ffmpeg 生成 jpg，然后 sharp 转 webp (统一格式) 或者直接用 jpg。
        // 修正：上面的 thumbnailName 是 .webp。
        // 让我们改变策略：先生成临时文件 temp-hash.jpg
        
        // 重新实现视频部分：
      }
    } catch (err) {
       // outer catch handles logging
       throw err; 
    }
    
    // ... wait, rewriting the block clearly below ...

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
            // userFile.storage is checked above
            ffmpeg(userFile.storage!.filePath)
              .screenshots({
                timestamps: ['10'], // 10秒处
                filename: tempThumbName,
                folder: thumbnailsDir,
                size: '200x200'
              })
              .on('end', () => resolve(true))
              .on('error', (err) => {
                console.error('FFmpeg error:', err);
                reject(err);
              });
          });
        } catch (ffmpegErr) {
           console.error('FFmpeg execution failed:', ffmpegErr);
           throw ffmpegErr;
        }

        // 检查生成的临时文件
        // ffmpeg screenshots 通常直接生成指定名字。
        if (fs.existsSync(tempThumbPath)) {
           // 将 jpg 转为 webp 以统一格式并优化体积
           await sharp(tempThumbPath)
             .resize(200, 200, { fit: 'cover' }) // 再次确保尺寸（虽然ffmpeg已缩放，但fit cover更好）
             .webp({ quality: 80 })
             .toFile(thumbnailPath);
           
           // 删除临时文件
           fs.unlinkSync(tempThumbPath);
        } else {
           // 尝试了截取10s但失败（可能是视频小于10s），尝试截取第1秒
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
      }

      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.sendFile(thumbnailPath);
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
