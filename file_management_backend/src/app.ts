import { createServer } from 'http';
import { initSocket } from './realtime/socket.js';
import { createApp } from './createApp.js';

// 这里在启动段引入定时清理任务（如清理无引用文件）
import { initCleanupJob } from './jobs/cleanup.job.js';

const app = createApp();

const PORT = process.env.PORT || 3000;
const httpServer = createServer(app);

// 这样写就是让Http和WebSocket共用同一个端口。把 Socket.IO 绑到同一 httpServer，REST 和 WebSocket 共用 PORT
// 这里启动 WebSocket 服务之后，前端发起连接这里就能接收到了。
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);

  // 	启动 cron 类定时任务。
  initCleanupJob();

  console.log(`📝 Environment: ${process.env.NODE_ENV}`);
  console.log(`🌐 CORS Origin: ${process.env.CORS_ORIGIN}`);
  console.log(`💾 Database: Prisma + MySQL`);
  console.log(`🔌 WebSocket: Socket.IO at /socket.io`);
});
