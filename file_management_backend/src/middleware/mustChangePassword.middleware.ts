import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import type { Request } from 'express';
import type { JwtPayload } from '../types/index.js';

dotenv.config();

/** 未改临时密码时，仅允许调用这些接口（须与路由 path 一致） */
const ALLOWED_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/change-password',
]);

/**
 * 若 Access Token 中 mustChangePassword === true，则禁止访问除白名单外的 /api 接口
 *（须放在各 API 路由之前；无 Token 的请求放行，由具体路由返回 401）
 */
export function blockIfMustChangePassword(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  if (!req.path.startsWith('/api')) {
    next();
    return;
  }

  if (ALLOWED_PATHS.has(req.path)) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    if (decoded.mustChangePassword === true) {
      res.status(403).json({
        success: false,
        code: 'MUST_CHANGE_PASSWORD',
        message: '您正在使用管理员重置的临时密码，请先修改密码后再继续使用',
      });
      return;
    }
  } catch {
    // 令牌无效或过期：交给后续路由 / 鉴权处理
  }

  next();
}
