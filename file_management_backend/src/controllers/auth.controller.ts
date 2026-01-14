import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { AuthRequest, LoginBody, RegisterBody } from '../types/index.js';

/**
 * 生成 JWT Token
 */
const generateToken = (userId: number, username: string): string => {
  return jwt.sign(
    { id: userId, username },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
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
      res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
      return;
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
      return;
    }

    // 生成 token
    const token = generateToken(user.id, user.username);

    res.json({
      success: true,
      message: '登录成功',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: '登录失败'
    });
  }
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

    // 检查用户是否已存在
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

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建新用户
    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        email: email || null
      }
    });

    // 生成 token
    const token = generateToken(newUser.id, newUser.username);

    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email
        },
        token
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: '注册失败'
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
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: '获取用户信息失败'
    });
  }
};
