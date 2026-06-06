import dotenv from 'dotenv';

// 必须在 connectRedis 之前加载 .env；override 避免终端里残留的错误 DATABASE_URL 覆盖 .env
// 保留 shell 传入的 PORT（便于多实例：PORT=3001 pnpm dev）
const portFromShell = process.env.PORT;
dotenv.config({ override: true });
if (portFromShell) {
  process.env.PORT = portFromShell;
}

import { createServer } from 'http';
import { initSocket } from './realtime/socket.js';
import { createApp } from './createApp.js';
import { connectRedis } from './lib/redis.js';
// 这里在启动段引入定时清理任务（如清理无引用文件）
import { initCleanupJob } from './jobs/cleanup.job.js';

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
  console.log(`🚀 Server is running on port ${PORT}`);

  // 	启动 cron 类定时任务。
  initCleanupJob();

  console.log(`📝 Environment: ${process.env.NODE_ENV}`);
  console.log(`🌐 CORS Origin: ${process.env.CORS_ORIGIN}`);
  console.log(`💾 Database: Prisma + MySQL`);
  console.log(`🔌 WebSocket: Socket.IO at /socket.io`);
});
