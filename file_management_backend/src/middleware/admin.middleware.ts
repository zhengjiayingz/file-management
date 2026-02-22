import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/index.js';

/**
 * 验证管理员权限中间件
 * 必须在 authenticate 中间件之后使用
 */
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            message: '未登录'
        });
        return;
    }

    if (req.user.role !== 'admin') {
        res.status(403).json({
            success: false,
            message: '无权访问，需要管理员权限'
        });
        return;
    }

    next();
};
