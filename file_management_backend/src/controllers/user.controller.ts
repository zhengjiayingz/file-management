import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { AuthRequest, UpdateProfileBody } from '../types/index.js';
import { isValidEmailFormat } from '../utils/email.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function profilePayload(user: {
  id: number;
  username: string;
  email: string | null;
  role: string;
  storageQuota: bigint;
  storageUsed: bigint;
  status: string;
  vipExpireAt: Date | null;
  avatarUrl: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    storage_quota: Number(user.storageQuota),
    storage_used: Number(user.storageUsed),
    status: user.status,
    vip_expire_at: user.vipExpireAt ? user.vipExpireAt.toISOString() : null,
    avatar_url: user.avatarUrl,
    created_at: user.createdAt.toISOString(),
  };
}

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
        role: true,
        storageQuota: true,
        storageUsed: true,
        status: true,
        vipExpireAt: true,
        avatarUrl: true,
        createdAt: true,
      },
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
      data: profilePayload(user),
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
 * 更新用户资料（当前支持邮箱）
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
    if (email === undefined) {
      res.status(400).json({ success: false, message: '请提供要更新的字段' });
      return;
    }

    let nextEmail: string | null;
    if (email === null || email === '') {
      nextEmail = null;
    } else if (typeof email === 'string') {
      const trimmed = email.trim();
      if (!trimmed) {
        nextEmail = null;
      } else if (!isValidEmailFormat(trimmed)) {
        res.status(400).json({ success: false, message: '邮箱格式不正确' });
        return;
      } else {
        nextEmail = trimmed;
      }
    } else {
      res.status(400).json({ success: false, message: '邮箱格式不正确' });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { email: nextEmail },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        storageQuota: true,
        storageUsed: true,
        status: true,
        vipExpireAt: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      message: '用户资料更新成功',
      data: profilePayload(updatedUser),
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(400).json({ success: false, message: '该邮箱已被其他账号使用' });
      return;
    }
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: '更新用户资料失败'
    });
  }
};

/**
 * 上传头像（保存路径并更新 users.avatar_url）
 */
export const uploadAvatar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }
    const file = (req as AuthRequest & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ success: false, message: '请选择图片文件' });
      return;
    }

    const publicPath = `/uploads/avatars/${file.filename}`;

    const prev = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { avatarUrl: true },
    });
    if (prev?.avatarUrl?.startsWith('/uploads/avatars/')) {
      const abs = path.join(__dirname, '../..', prev.avatarUrl.replace(/^\//, ''));
      try {
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch {
        /* 忽略删除旧文件失败 */
      }
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl: publicPath },
    });

    res.json({
      success: true,
      message: '头像已更新',
      data: { avatar_url: publicPath },
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ success: false, message: '头像上传失败' });
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
