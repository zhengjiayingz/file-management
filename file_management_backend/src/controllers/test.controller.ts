/**
 * 测试控制器
 * 用于测试 Prisma ORM 操作
 */

import { Request, Response } from 'express';
import prisma from '../lib/prisma.js';

/**
 * 测试创建文件记录
 */
export const createTestFile = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📝 开始创建测试文件记录...');

    // 生成测试数据
    const timestamp = Date.now();
    const testFile = {
      filename: `test-file-${timestamp}.txt`,
      originalName: `测试文件-${timestamp}.txt`,
      mimetype: 'text/plain',
      size: 1024,
      path: `./uploads/test-file-${timestamp}.txt`,
      userId: 1 // 使用 admin 用户（ID=1）
    };

    console.log('📊 测试数据:', testFile);

    // 使用 Prisma ORM 创建记录
    const file = await prisma.file.create({
      data: testFile,
      select: {
        id: true,
        filename: true,
        originalName: true,
        mimetype: true,
        size: true,
        path: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    });

    console.log('✅ 文件记录创建成功！', file);

    res.status(201).json({
      success: true,
      message: '测试文件记录创建成功！',
      data: file
    });

  } catch (error: any) {
    console.error('❌ 创建文件记录失败:', error);
    
    res.status(500).json({
      success: false,
      message: '创建文件记录失败',
      error: error.message
    });
  }
};

/**
 * 获取所有文件记录
 */
export const getAllFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📋 获取所有文件记录...');

    const files = await prisma.file.findMany({
      select: {
        id: true,
        filename: true,
        originalName: true,
        mimetype: true,
        size: true,
        path: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`✅ 找到 ${files.length} 条文件记录`);

    res.json({
      success: true,
      message: '获取文件列表成功',
      data: files,
      total: files.length
    });

  } catch (error: any) {
    console.error('❌ 获取文件列表失败:', error);
    
    res.status(500).json({
      success: false,
      message: '获取文件列表失败',
      error: error.message
    });
  }
};

/**
 * 删除测试文件记录
 */
export const deleteTestFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    console.log(`🗑️  删除文件记录 ID: ${id}`);

    const file = await prisma.file.delete({
      where: {
        id: parseInt(id)
      }
    });

    console.log('✅ 文件记录删除成功！', file);

    res.json({
      success: true,
      message: '文件记录删除成功',
      data: file
    });

  } catch (error: any) {
    console.error('❌ 删除文件记录失败:', error);
    
    res.status(500).json({
      success: false,
      message: '删除文件记录失败',
      error: error.message
    });
  }
};

/**
 * 清空所有测试文件记录
 */
export const clearTestFiles = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🧹 清空所有测试文件记录...');

    // 删除文件名包含 "test-file-" 的记录
    const result = await prisma.file.deleteMany({
      where: {
        filename: {
          contains: 'test-file-'
        }
      }
    });

    console.log(`✅ 已删除 ${result.count} 条测试记录`);

    res.json({
      success: true,
      message: `成功删除 ${result.count} 条测试记录`,
      count: result.count
    });

  } catch (error: any) {
    console.error('❌ 清空测试记录失败:', error);
    
    res.status(500).json({
      success: false,
      message: '清空测试记录失败',
      error: error.message
    });
  }
};
