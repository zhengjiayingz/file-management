import { Request, Response, NextFunction } from 'express';

/**
 * 全局错误处理中间件
 */
export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction): void => {
  // console.error('Error:', err);
  req.log?.error({err},'未处理异常')

  // Multer 文件上传错误
  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({
      success: false,
      message: '文件大小超过限制'
    });
    return;
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    res.status(400).json({
      success: false,
      message: '意外的文件字段'
    });
    return;
  }

  // 验证错误
  if (err.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      message: '数据验证失败',
      errors: err.errors
    });
    return;
  }

  // JWT 错误
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      message: '无效的认证令牌'
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      message: '认证令牌已过期'
    });
    return;
  }

  // Prisma 错误
  if (err.code === 'P2002') {
    res.status(400).json({
      success: false,
      message: '数据已存在，违反唯一性约束'
    });
    return;
  }

  if (err.code === 'P2025') {
    res.status(404).json({
      success: false,
      message: '记录不存在'
    });
    return;
  }

  // 默认错误
  const statusCode = err.statusCode || 500;
  const message = err.message || '服务器内部错误';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
