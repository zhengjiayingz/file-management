import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../lib/prisma.js';
import { AuthRequest } from '../types/index.js';

/**
 * 上传文件
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

    // 创建文件记录
    const fileRecord = await prisma.file.create({
      data: {
        originalName: req.file.originalname,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
        userId: req.user.id
      }
    });

    res.status(201).json({
      success: true,
      message: '文件上传成功',
      data: {
        id: fileRecord.id,
        originalName: fileRecord.originalName,
        filename: fileRecord.filename,
        size: fileRecord.size,
        createdAt: fileRecord.createdAt
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

    // 只返回当前用户上传的文件
    const files = await prisma.file.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        originalName: true,
        filename: true,
        mimetype: true,
        size: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

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

    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        userId: req.user.id
      },
      select: {
        id: true,
        originalName: true,
        filename: true,
        mimetype: true,
        size: true,
        createdAt: true
      }
    });

    if (!file) {
      res.status(404).json({
        success: false,
        message: '文件不存在'
      });
      return;
    }

    res.json({
      success: true,
      data: file
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

    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        userId: req.user.id
      }
    });

    if (!file) {
      res.status(404).json({
        success: false,
        message: '文件不存在'
      });
      return;
    }

    // 检查文件是否存在
    if (!fs.existsSync(file.path)) {
      res.status(404).json({
        success: false,
        message: '文件已被删除'
      });
      return;
    }

    // 设置响应头
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Content-Type', file.mimetype);

    // 发送文件
    res.sendFile(path.resolve(file.path));
  } catch (error) {
    console.error('Download file error:', error);
    res.status(500).json({
      success: false,
      message: '文件下载失败'
    });
  }
};

/**
 * 删除文件
 */
export const deleteFile = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        userId: req.user.id
      }
    });

    if (!file) {
      res.status(404).json({
        success: false,
        message: '文件不存在'
      });
      return;
    }

    // 删除物理文件
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    // 从数据库删除记录
    await prisma.file.delete({
      where: { id: fileId }
    });

    res.json({
      success: true,
      message: '文件删除成功'
    });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      message: '文件删除失败'
    });
  }
};
