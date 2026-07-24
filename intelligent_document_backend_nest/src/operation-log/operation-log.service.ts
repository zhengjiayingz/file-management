import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

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
  VERSION_ROLLBACK = 'VERSION_ROLLBACK',
}

export enum LogResourceType {
  FILE = 'FILE',
  FOLDER = 'FOLDER',
  USER = 'USER',
  SHARE = 'SHARE',
}

type LogOptions = {
  req: Request;
  userId: number;
  operationType: LogOperationType | string;
  resourceType: LogResourceType | string;
  resourceId?: number;
  description?: string;
};

@Injectable()
export class OperationLogService {
  constructor(private readonly prisma: PrismaService) {}

  async logOperation(options: LogOptions): Promise<void> {
    try {
      const {
        req,
        userId,
        operationType,
        resourceType,
        resourceId,
        description,
      } = options;
      const ipAddress =
        (req.headers['x-forwarded-for'] as string) ||
        req.socket.remoteAddress ||
        'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      await this.prisma.operationLog.create({
        data: {
          userId,
          operationType,
          resourceType,
          resourceId,
          description: description ? description.substring(0, 500) : undefined,
          ipAddress: ipAddress.toString().substring(0, 45),
          userAgent: userAgent.substring(0, 500),
        },
      });
    } catch (error) {
      console.error('Failed to create operation log:', error);
    }
  }
}
