import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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

// 配置环境变量，把 file_management_backend/.env 里的配置加载进 process.env
dotenv.config();  // 读取项目根目录 .env，写入 process.env

// 获取 __dirname (ES Module 中需要手动获取)
const __filename = fileURLToPath(import.meta.url); // 当前文件绝对路径。CommonJS 自带 __filename，ES Module 需自己算
const __dirname = path.dirname(__filename);  // 当前文件所在目录（一般是 src/

/**
 * 组装 Express 应用（中间件 + 路由），不 listen、不启 Socket、不启定时任务。
 * 供 app.ts 启动服务，以及 Vitest + Supertest 集成测试 import（避免占端口）。
 */
export function createApp(): express.Application {
  // 创建 Express 应用
  const app: express.Application = express();

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

  // 健康检查路由
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      message: 'File Management API is running',
      timestamp: new Date().toISOString(),
      database: 'MySQL'
    });
  });

  // 配置 Swagger API 文档
  setupSwagger(app);

  app.use(blockIfMustChangePassword); //放在业务 API 之前：之后所有 /api/* 请求都会先检查是否必须先改密码

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
