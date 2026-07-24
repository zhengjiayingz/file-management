import './loadEnv.js';

import { createServer } from 'http';
import { initSocket } from './realtime/socket.js';
import { createApp } from './createApp.js';
import { connectRedis } from './lib/redis.js';
// 这里在启动段引入定时清理任务（如清理无引用文件）
import { initCleanupJob } from './jobs/cleanup.job.js';
import { logger } from './lib/logger.js';

// 先连redis
await connectRedis();

const app = createApp();
const PORT = process.env.PORT || 3000;
const httpServer = createServer(app);

// 这样写就是让Http和WebSocket共用同一个端口。把 Socket.IO 绑到同一 httpServer，REST 和 WebSocket 共用 PORT
// 这里启动 WebSocket 服务之后，前端发起连接这里就能接收到了。
// 初始化socket
await initSocket(httpServer);

httpServer.listen(PORT, () => {
  initCleanupJob();

  logger.info(
    {
      port: PORT,
      nodeEnv: process.env.NODE_ENV,
      corsOrigin: process.env.CORS_ORIGIN,
      database: 'Prisma + MySQL',
      websocket: '/socket.io',
    },
    '服务已启动',
  );
});
