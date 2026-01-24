import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 导入路由
import authRoutes from './routes/auth.routes.js';
import fileRoutes from './routes/file.routes.js';
import userRoutes from './routes/user.routes.js';

// 导入中间件
import { errorHandler } from './middleware/error.middleware.js';
import { notFound } from './middleware/notFound.middleware.js';

// 配置环境变量
dotenv.config();

// 获取 __dirname (ES Module 中需要手动获取)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建 Express 应用
const app: express.Application = express();

// 中间件配置
app.use(cors({
  origin: (origin, callback) => {
    // 开发环境允许所有 localhost 端口
    if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) {
      callback(null, true);
    } else if (process.env.CORS_ORIGIN) {
      callback(null, process.env.CORS_ORIGIN);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务 (上传的文件)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 健康检查路由
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'File Management API is running',
    timestamp: new Date().toISOString(),
    database: 'MySQL'
  });
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/users', userRoutes);

// 404 处理
app.use(notFound);

// 错误处理中间件
app.use(errorHandler);

// 启动服务器
// 启动服务器
import { initCleanupJob } from './jobs/cleanup.job.js';

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  
  // 初始化定时任务
  initCleanupJob();

  console.log(`📝 Environment: ${process.env.NODE_ENV}`);
  console.log(`🌐 CORS Origin: ${process.env.CORS_ORIGIN}`);
  console.log(`💾 Database: Prisma + MySQL`);
});

export default app;
