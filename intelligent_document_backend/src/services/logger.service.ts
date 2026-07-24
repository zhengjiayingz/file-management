
import { Request } from 'express';
import prisma from '../lib/prisma.js';

export enum LogOperationType {
  UPLOAD = 'UPLOAD',
  DOWNLOAD = 'DOWNLOAD',
  DELETE = 'DELETE',
  RESTORE = 'RESTORE', 
  PERMANENT_DELETE = 'PERMANENT_DELETE',
  RENAME = 'RENAME',
  MOVE = 'MOVE',
  SHARE = 'SHARE',
  LOGIN = 'LOGIN',
  REGISTER = 'REGISTER',
  UPDATE = 'UPDATE',
  VERSION_ROLLBACK = 'VERSION_ROLLBACK'
}

export enum LogResourceType {
  FILE = 'FILE',
  FOLDER = 'FOLDER',
  USER = 'USER',
  SHARE = 'SHARE'
}

interface LogOptions {
  req: Request;
  userId: number;
  operationType: LogOperationType | string;
  resourceType: LogResourceType | string;
  resourceId?: number;
  description?: string;
}

/**
 * 记录操作日志
 */
export const logOperation = async (options: LogOptions) => {
  try {
    const { req, userId, operationType, resourceType, resourceId, description } = options;
    
    // 获取 IP 地址 (处理可能的反向代理情况)
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    
    // 获取 User Agent
    const userAgent = req.headers['user-agent'] || 'unknown';

    await prisma.operationLog.create({
      data: {
        userId,
        operationType,
        resourceType,
        resourceId,
        description: description ? description.substring(0, 500) : undefined, // 截断以防过长
        ipAddress: ipAddress.toString().substring(0, 45), // 截断以防过长 (IPV6可能长)
        userAgent: userAgent.substring(0, 500)
      }
    });

  } catch (error) {
    // 日志记录失败不应影响主业务流程，仅在控制台输出错误
    console.error('Failed to create operation log:', error);
  }
};
