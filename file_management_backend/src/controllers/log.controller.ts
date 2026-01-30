
import { Response } from 'express';
import prisma from '../lib/prisma.js';
import { AuthRequest } from '../types/index.js';

/**
 * 获取操作日志
 * 支持：分页，搜索（类型、日期、关键字、用户），排序
 */
export const getOperationLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未认证' });
      return;
    }

    const currentUserId = req.user.id;
    
    // 获取完整用户信息以判断角色
    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId }
    });
    
    if (!currentUser) {
      res.status(401).json({ success: false, message: '用户不存在' });
      return;
    }

    const isAdmin = currentUser.role === 'admin';

    // 获取查询参数
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const { operationType, type, startDate, endDate, keyword, targetUserId, sortOrder } = req.query;

    // 构建查询条件
    const where: any = {};

    // 1. 权限过滤：非管理员只能查自己的
    if (!isAdmin) {
      where.userId = currentUserId;
    } else if (targetUserId) {
      // 管理员且指定了目标用户
      where.userId = parseInt(targetUserId as string);
    }
    // 如果是管理员且没指定 targetUserId，则查所有

    // 2. 操作类型过滤
    if (operationType) {
      where.operationType = operationType;
    } else if (type) {
      where.operationType = type;
    }

    // 3. 日期范围过滤
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        // 结束日期通常涵盖当天结束，如 2023-01-01 -> 2023-01-01 23:59:59，或者前端传第二天0点
        // 这里简单处理，如果前端传的是日期字符串，Prisma会处理比较
        where.createdAt.lte = new Date(endDate as string);
      }
    }

    // 4. 关键字搜索 (description)
    if (keyword) {
      where.description = {
        contains: keyword as string
      };
    }

    // 执行查询
    const total = await prisma.operationLog.count({ where });

    const logs = await prisma.operationLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: (sortOrder === 'asc' ? 'asc' : 'desc')
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ success: false, message: '获取日志列表失败' });
  }
};
