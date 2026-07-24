import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null && 'success' in body) {
        response.status(status).json(body);
        return;
      }
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ??
            exception.message);
      response.status(status).json({
        success: false,
        message: Array.isArray(message) ? message.join(', ') : message,
      });
      return;
    }

    const err = exception as {
      code?: string;
      name?: string;
      message?: string;
      statusCode?: number;
      stack?: string;
    };

    this.logger.error(err?.message ?? exception, err?.stack);

    if (err?.message === '不支持的文件类型') {
      response.status(400).json({ success: false, message: err.message });
      return;
    }
    if (err?.code === 'LIMIT_FILE_SIZE') {
      response
        .status(400)
        .json({ success: false, message: '文件大小超过限制' });
      return;
    }
    if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
      response.status(400).json({ success: false, message: '意外的文件字段' });
      return;
    }
    if (err?.name === 'JsonWebTokenError') {
      response.status(401).json({ success: false, message: '无效的认证令牌' });
      return;
    }
    if (err?.name === 'TokenExpiredError') {
      response.status(401).json({ success: false, message: '认证令牌已过期' });
      return;
    }
    if (err?.code === 'P2002') {
      response
        .status(400)
        .json({ success: false, message: '数据已存在，违反唯一性约束' });
      return;
    }
    if (err?.code === 'P2025') {
      response.status(404).json({ success: false, message: '记录不存在' });
      return;
    }

    const statusCode = err?.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(statusCode).json({
      success: false,
      message: err?.message ?? '服务器内部错误',
      ...(process.env.NODE_ENV === 'development' && err?.stack
        ? { stack: err.stack }
        : {}),
    });
  }
}
