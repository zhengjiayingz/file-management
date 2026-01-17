import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import prisma from '../lib/prisma.js';
import { AuthRequest, JwtPayload } from '../types/index.js';

// 确保环境变量被加载
dotenv.config();

/**
 * 验证 JWT Token 中间件
 */
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    // 从请求头获取 token
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: '未提供认证令牌'
      });
      return;
    }

    const token = authHeader.substring(7); // 移除 'Bearer ' 前缀

    // 验证 token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    
    // 验证用户是否存在且状态正常
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        username: true,
        status: true
      }
    });
    
    if (!user || user.status !== 'active') {
      res.status(401).json({
        success: false,
        message: '用户不存在或已被禁用'
      });
      return;
    }
    
    // 将用户信息附加到请求对象
    req.user = decoded;
    
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        message: '无效的认证令牌'
      });
      return;
    }
    
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        message: '认证令牌已过期'
      });
      return;
    }
    
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: '认证失败'
    });
  }
};

/**
 * 可选的认证中间件（不强制要求登录）
 */
export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      
      // 验证用户是否存在且状态正常
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          username: true,
          status: true
        }
      });
      
      if (user && user.status === 'active') {
        req.user = decoded;
      }
    }
    
    next();
  } catch (error) {
    // 即使验证失败也继续，因为是可选的
    next();
  }
};
