import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthRequest, UpdateProfileBody } from '../types/index.js';

/**
 * 获取用户资料
 */
export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证'
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        email: true,
        createdAt: true
      }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: '用户不存在'
      });
      return;
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: '获取用户资料失败'
    });
  }
};

/**
 * 更新用户资料
 */
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '未认证'
      });
      return;
    }

    const { email } = req.body as UpdateProfileBody;

    // 更新用户信息
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(email !== undefined && { email })
      },
      select: {
        id: true,
        username: true,
        email: true
      }
    });

    res.json({
      success: true,
      message: '用户资料更新成功',
      data: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: '更新用户资料失败'
    });
  }
};

/**
 * 搜索用户 (支持根据用户名模糊搜索和精确的ID搜索)
 */
export const searchUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { keyword } = req.query;

    if (!keyword) {
      res.json({ success: true, data: [] });
      return;
    }

    const kwStr = String(keyword);
    const searchConditions: any[] = [
      { username: { contains: kwStr } }
    ];

    // 如果全数字，也尝试按ID搜索
    if (/^\d+$/.test(kwStr)) {
      searchConditions.push({ id: parseInt(kwStr) });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: searchConditions,
        // 排除自己
        id: { not: req.user?.id }
      },
      select: {
        id: true,
        username: true,
        email: true
      },
      take: 20
    });

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ success: false, message: '搜索用户失败' });
  }
};
