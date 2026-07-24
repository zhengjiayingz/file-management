import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http'
import { logger, genReqId } from './lib/logger.js'

// 导入路由
import authRoutes from './routes/auth.routes.js';
import fileRoutes from './routes/file.routes.js';
import userRoutes from './routes/user.routes.js';
import logRoutes from './routes/log.routes.js';
import userPreferenceRoutes from './routes/user-preference.routes.js';  //语言，主题偏好
import adminRoutes from './routes/admin.routes.js';  //管理后台相关
import friendshipRoutes from './routes/friendship.routes.js';  //好友关系
import messageRoutes from './routes/message.routes.js'; // 聊天 REST（发消息、历史、已读）
import vipRoutes from './routes/vip.routes.js'; // VIP 申请审核
import shareRoutes from './routes/share.routes.js'; // 外链分享

// 导入中间件
import { errorHandler } from './middleware/error.middleware.js';  // 全局错误处理：controller 里 throw 或 next(err) 时，统一返回 JSON 错误。
import { notFound } from './middleware/notFound.middleware.js';  // 404 处理：没找到路由时，返回 404 错误。
import { blockIfMustChangePassword } from './middleware/mustChangePassword.middleware.js'; // 用户被管理员重置为临时密码、必须改密时，除改密等白名单外，其它 API 拦截。
import { setupSwagger } from './config/swagger.config.js';
import { getApiRateLimiter, initRateLimiters } from './middleware/rateLimit.middleware.js';
import { runHealthCheck } from './lib/healthCheck.js';

// 获取 __dirname (ES Module 中需要手动获取)
const __filename = fileURLToPath(import.meta.url); // 当前文件绝对路径。CommonJS 自带 __filename，ES Module 需自己算
const __dirname = path.dirname(__filename);  // 当前文件所在目录（一般是 src/

/** 允许将 API 响应（如 Office PDF 预览）嵌入前端 iframe 的祖先源 */
function resolveFrameAncestors(): string[] {
  const ancestors = ["'self'"];
  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  if (corsOrigin) {
    ancestors.push(corsOrigin);
    return ancestors;
  }
  if (process.env.NODE_ENV !== 'production') {
    for (let port = 5173; port <= 5200; port++) {
      ancestors.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
    }
  }
  return ancestors;
}

/**
 * 组装 Express 应用（中间件 + 路由），不 listen、不启 Socket、不启定时任务。
 * 供 app.ts 启动服务，以及 Vitest + Supertest 集成测试 import（避免占端口）。
 */
export function createApp(): express.Application {
  // 创建 Express 应用
  const app: express.Application = express();

  // 须在挂路由前初始化限流（connectRedis 已在 app.ts 完成；express-rate-limit v8 须在 app 初始化时 create）
  initRateLimiters();

  // 关闭 X-Frame-Options，改用 CSP frame-ancestors，否则 localhost:5173 无法 iframe 嵌入 localhost:3000 的 PDF 预览
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      frameguard: false,
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'frame-ancestors': resolveFrameAncestors(),
        },
      },
    }),
  );
  // 每条请求会自动记录 reqId、method、url、statusCode、responseTime
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers['x-request-id'] as string) || genReqId(),
      autoLogging: {
        ignore: (req) =>
          req.method === 'OPTIONS' ||
          req.url === '/health' ||     // 4.2 增强了 /health，探活会更频繁,所以探活就不要打日志了
          req.url?.startsWith('/api-docs') === true,
      },
      serializers: {
        req: (req) => ({    // 日志格式化：req 对象序列化成 JSON 对象
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
      customSuccessMessage: (req, res) =>
        `${req.method} ${req.url} ${res.statusCode}`,
      customErrorMessage: (req, res, err) =>
        `${req.method} ${req.url} ${res.statusCode} - ${err.message}`,
      customAttributeKeys: {
        responseTime: 'responseTimeMs',
      },
    }),
  );


  // 中间件配置
  app.use(cors({
    origin: (origin, callback) => {
      // 开发环境允许所有 localhost 端口，第二个参数cors 库约定应是布尔「是否允许」
      if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) { //无 origin（如 Postman）→ 允许
        callback(null, true);
      } else if (process.env.CORS_ORIGIN) { // 否则若 .env 有 CORS_ORIGIN 且匹配 → 允许
        callback(null, process.env.CORS_ORIGIN);
      } else {
        callback(new Error('Not allowed by CORS')); // 否则拒绝
      }
    },
    credentials: true, // 允许跨域携带 cookie/Authorization（前端 withCredentials）
    // 前端 axios 需读取 Content-Disposition 作为下载文件名（跨域默认不可见）
    exposedHeaders: ['Content-Disposition'] // 跨域时前端 JS 可读响应头 Content-Disposition，用于下载文件名。
  }));
  app.use(express.json());// 解析 Content-Type: application/json 的 body → req.body。
  app.use(express.urlencoded({ extended: true })); // 解析表单 application/x-www-form-urlencoded 请求体。extended: true 允许嵌套对象。

  // 静态文件服务 (上传的文件)
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

  // 健康检查：MySQL 必检；配置了 REDIS_URL 时 Redis 必检，否则 skipped
  app.get('/health', async (_req, res) => {
    const result = await runHealthCheck();
    res.status(result.status === 'ok' ? 200 : 503).json(result);
  });

  // 配置 Swagger API 文档
  setupSwagger(app);


  app.use(blockIfMustChangePassword); //放在业务 API 之前：之后所有 /api/* 请求都会先检查是否必须先改密码

  // 3.2 全局限流：/api/* 每分钟 300 次；/health、/api-docs 不在 /api 下，自然白名单
  app.use('/api', getApiRateLimiter());
  // API 路由
  app.use('/api/auth', authRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api/user', userRoutes);
  app.use('/api/user-preferences', userPreferenceRoutes);
  app.use('/api/logs', logRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/friendships', friendshipRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/vip', vipRoutes);
  app.use('/api/shares', shareRoutes);

  // 404 处理,必须在路由后面
  app.use(notFound);

  // 错误处理中间件
  app.use(errorHandler);

  return app;
}
