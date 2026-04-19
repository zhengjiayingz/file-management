import { Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import prisma from '../lib/prisma.js';
import { AuthRequest, LoginBody, RegisterBody } from '../types/index.js';
import { ensureFriendshipWithAdmin, getPrimaryAdminId } from '../services/adminFriend.service.js';
import { emitToUser } from '../realtime/socket.js';
import { loadMessageForEmit } from '../realtime/messagePayload.js';

// 确保环境变量被加载
dotenv.config();

/**
 * SHA256 密码加密
 */
const hashPassword = (password: string): string => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

/**
 * 生成 Access Token (15分钟)
 */
const generateAccessToken = (userId: number, username: string): string => {
  return jwt.sign(
    { id: userId, username },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  );
};

/**
 * 生成 Refresh Token (7天)
 */
const generateRefreshToken = (): string => {
  return crypto.randomBytes(64).toString('hex');
};

/**
 * 用户注册
 */
export const register = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, password, email } = req.body as RegisterBody;

    // 验证输入
    if (!username || !password) {
      res.status(400).json({
        success: false,
        message: '请提供用户名和密码'
      });
      return;
    }

    // 验证用户名长度
    if (username.length < 3 || username.length > 50) {
      res.status(400).json({
        success: false,
        message: '用户名长度必须在3-50个字符之间'
      });
      return;
    }

    // 验证密码强度
    if (password.length < 8) {
      res.status(400).json({
        success: false,
        message: '密码长度至少8位'
      });
      return;
    }

    // 验证密码强度：至少包含数字、字母、大小写、特殊字符中的3种
    const hasNumber = /\d/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    const strengthCount = [hasNumber, hasLower, hasUpper, hasSpecial].filter(Boolean).length;
    
    if (strengthCount < 3) {
      res.status(400).json({
        success: false,
        message: '密码必须包含数字、字母、大小写、特殊字符中至少3种'
      });
      return;
    }

    // 检查用户名是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });
    
    if (existingUser) {
      res.status(400).json({
        success: false,
        message: '用户名已存在'
      });
      return;
    }

    // 检查邮箱是否已存在
    if (email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email }
      });
      
      if (existingEmail) {
        res.status(400).json({
          success: false,
          message: '邮箱已被注册'
        });
        return;
      }
    }

    // 加密密码
    const hashedPassword = hashPassword(password);

    // 使用事务创建用户和相关记录
    const result = await prisma.$transaction(async (tx) => {
      // 创建新用户
      const newUser = await tx.user.create({
        data: {
          username,
          password: hashedPassword,
          email: email || null,
          role: 'user',
          storageQuota: BigInt(1073741824), // 1GB
          storageUsed: BigInt(0),
          status: 'active'
        }
      });

      // 生成tokens
      const accessToken = generateAccessToken(newUser.id, newUser.username);
      const refreshToken = generateRefreshToken();

      // 存储 Refresh Token
      await tx.refreshToken.create({
        data: {
          userId: newUser.id,
          token: refreshToken,
          deviceType: 'web',
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7天后过期
        }
      });

      // 记录登录日志
      await tx.loginLog.create({
        data: {
          userId: newUser.id,
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          status: 'success'
        }
      });

      return { newUser, accessToken, refreshToken };
    });

    try {
      await ensureFriendshipWithAdmin(result.newUser.id);
    } catch (e) {
      console.error('Register: ensureFriendshipWithAdmin failed:', e);
    }

    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        user: {
          id: result.newUser.id,
          username: result.newUser.username,
          email: result.newUser.email,
          role: result.newUser.role,
          storage_quota: Number(result.newUser.storageQuota),
          storage_used: Number(result.newUser.storageUsed)
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: '注册失败，请稍后重试'
    });
  }
};

/**
 * 用户登录
 */
export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body as LoginBody;

    // 验证输入
    if (!username || !password) {
      res.status(400).json({
        success: false,
        message: '请提供用户名和密码'
      });
      return;
    }

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { username }
    });
    
    if (!user) {
      // 记录失败的登录尝试
      await prisma.loginLog.create({
        data: {
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          status: 'failed',
          failReason: '用户不存在'
        }
      });
      
      res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
      return;
    }

    // 检查账户状态（在验证密码之前，避免泄露账号是否存在的额外信息）
    if (user.status !== 'active') {
      await prisma.loginLog.create({
        data: {
          userId: user.id,
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          status: 'failed',
          failReason: '账户已被禁用'
        }
      });

      res.status(403).json({
        success: false,
        message: '账号处在封禁状态，请联系管理员'
      });
      return;
    }

    // 验证密码
    const hashedPassword = hashPassword(password);
    
    if (hashedPassword !== user.password) {
      // 记录失败的登录尝试
      await prisma.loginLog.create({
        data: {
          userId: user.id,
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          status: 'failed',
          failReason: '密码错误'
        }
      });
      
      res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
      return;
    }

    // 使用事务处理登录成功的操作
    const result = await prisma.$transaction(async (tx) => {
      // ... (existing code)
      // 生成tokens
      const accessToken = generateAccessToken(user.id, user.username);
      const refreshToken = generateRefreshToken();

      // 存储 Refresh Token
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          token: refreshToken,
          deviceType: 'web',
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7天后过期
        }
      });

      // 记录成功登录
      await tx.loginLog.create({
        data: {
          userId: user.id,
          ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || null,
          status: 'success'
        }
      });

      return { accessToken, refreshToken };
    });

    res.json({
      success: true,
      message: '登录成功',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          storage_quota: Number(user.storageQuota),
          storage_used: Number(user.storageUsed)
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: '登录失败，请稍后重试'
    });
  }
};

/**
 * 忘记密码：向管理员发送站内消息（需用户与管理员为好友；注册时已自动建立）
 */
export const forgotPasswordRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const username = (req.body as { username?: string })?.username?.trim();
    if (!username) {
      res.status(400).json({
        success: false,
        message: '请填写用户名'
      });
      return;
    }

    const adminId = await getPrimaryAdminId();
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, role: true }
    });

    if (adminId && user && user.role !== 'admin') {
      try {
        await ensureFriendshipWithAdmin(user.id);
        const created = await prisma.message.create({
          data: {
            senderId: user.id,
            receiverId: adminId,
            content: `[忘记密码] 用户 ${user.username}（ID:${user.id}）请求管理员重置密码。`,
            messageType: 'text'
          }
        });
        const full = await loadMessageForEmit(created.id);
        if (full) {
          emitToUser(adminId, 'message:new', { message: full });
        }
      } catch (e) {
        console.error('forgotPassword: message/friendship failed:', e);
      }
    }

    res.json({
      success: true,
      message: '请等待管理员重置密码'
    });
  } catch (error) {
    console.error('Forgot password request error:', error);
    res.status(500).json({
      success: false,
      message: '请求失败，请稍后重试'
    });
  }
};

/**
 * 刷新 Access Token
 */
export const refreshToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        success: false,
        message: '请提供 Refresh Token'
      });
      return;
    }

    // 验证 Refresh Token
    const tokenRecord = await prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        isRevoked: false,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            status: true
          }
        }
      }
    });

    if (!tokenRecord) {
      res.status(401).json({
        success: false,
        message: 'Refresh Token 无效或已过期'
      });
      return;
    }

    if (tokenRecord.user.status !== 'active') {
      await prisma.refreshToken.updateMany({
        where: { userId: tokenRecord.userId },
        data: { isRevoked: true }
      });
      res.status(403).json({
        success: false,
        message: '账号处在封禁状态，请联系管理员'
      });
      return;
    }

    // 更新最后使用时间并生成新的 Access Token
    const result = await prisma.$transaction(async (tx) => {
      // 更新最后使用时间
      await tx.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { lastUsedAt: new Date() }
      });

      // 生成新的 Access Token
      const newAccessToken = generateAccessToken(tokenRecord.user.id, tokenRecord.user.username);
      
      return { newAccessToken };
    });

    res.json({
      success: true,
      message: 'Token 刷新成功',
      data: {
        accessToken: result.newAccessToken
      }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Token 刷新失败'
    });
  }
};

/**
 * 用户登出
 */
export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // 撤销 Refresh Token
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { isRevoked: true }
      });
    }

    res.json({
      success: true,
      message: '登出成功'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: '登出失败'
    });
  }
};

/**
 * 获取当前用户信息
 */
export const getCurrentUser = async (req: AuthRequest, res: Response): Promise<void> => {
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
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        storage_quota: Number(user.storageQuota),
        storage_used: Number(user.storageUsed),
        status: user.status,
        created_at: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: '获取用户信息失败'
    });
  }
};