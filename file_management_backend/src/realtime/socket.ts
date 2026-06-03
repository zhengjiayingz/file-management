import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import type { JwtPayload } from '../types/index.js';

let io: Server | null = null;

function matchSocketCorsOrigin(origin: string | undefined, callback: (err: Error | null, ok?: boolean) => void) {
  if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) {
    callback(null, true);
    return; 
  }
  if (process.env.CORS_ORIGIN && origin === process.env.CORS_ORIGIN) {
    callback(null, true);
    return;
  }
  callback(new Error('Not allowed by CORS'));
}

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    // 规定 Engine.IO / Socket.IO 
    // 的 HTTP 长轮询 + WebSocket 的服务路径 前缀 是 /socket.io，和 前端 socket.io-client 
    // 默认 去连的路径 一致,所以 你不必在业务里手写 完整 URL 路径；若 改成别的字符串，前后端 要一起改 才能对上
    path: '/socket.io',
    //Socket 握手 也是 HTTP，浏览器 会带 Origin 头，CORS 策略 要在 Socket.IO 的 cors 配置 里单独 配，
    // 不完全等同于app.use(cors())那一条
    cors: {
      origin: matchSocketCorsOrigin,
      credentials: true, // 允许携带 Cookie
    },
  });

   // 对整个 io 实例注册一层中间件,next:放行函数；调用 next() 表示通过；
   // 调用 next(错误对象) 表示拒绝这次连接。  ladskfjdslakjf
  io.use(async (socket, next) => {
    try {
      const token =
      // 前端 io({ auth: { token } }) 会走这条；类型是字符串才要
        (typeof socket.handshake.auth?.token === 'string' && socket.handshake.auth.token) ||
        (typeof socket.handshake.query?.token === 'string' && socket.handshake.query.token);
        // 任何一边都没拿到合法 token
      if (!token) {
        // 告诉 Socket.IO 不要建立 这条已认证连接；客户端 会收到 连不上 / connect_error 之类表现。
        next(new Error('未提供认证令牌'));
        return;
      }
      // 用和服务端发 JWT 时相同的密钥 解 Access Token
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      // 行 按 token 里的用户 id 去数据库查用户
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        // 只选 id, status, mustChangePassword, sessionVersion
        select: { id: true, status: true, mustChangePassword: true, sessionVersion: true },
      });
      // 用户必须是非禁用账号
      if (!user || user.status !== 'active') {
        next(new Error('认证无效'));
        return;
      }
      const tokenSv = decoded.sv ?? 0;
      // 若 tokenSv !== user.sessionVersion：说明用户在别处已改密/踢线/让 session 升级，旧 token 应整份作废；Socket 也不让连
      if (tokenSv !== user.sessionVersion) {
        next(new Error('登录会话已失效'));
        return;
      }
      // user.mustChangePassword 为 true（管理员 reset 的临时密码 等）时，先 去改密，不给实时通道，
      // 避免绕过 必须先改密 的规则
      if (user.mustChangePassword) {
        next(new Error('请先修改临时密码后再使用实时通讯'));
        return;
      }
      // 把已验证通过的用户主键挂在本连接的 socket.data 上，后面 connection 里 join 房间
      socket.data.userId = user.id;
      // 不带参数 调用，表示中间件通过，继续 走后续逻辑，最终 会触发 io.on
      next();
    } catch {
      next(new Error('无效的认证令牌'));
    }
  });
  // 把「连接成功回调」登记到 io 上
  io.on('connection', (socket) => {
    const uid = socket.data.userId as number;
    socket.join(`user:${uid}`);
  });
  // 登记完2个方法后返回io对象给app.js
  return io;
}

export function getIo(): Server {
  if (!io) {
    throw new Error('Socket.IO 尚未初始化');
  }
  return io;
}

export function emitToUser(userId: number, event: string, payload: unknown): void {
  try {
    getIo().to(`user:${userId}`).emit(event, payload);
  } catch (e) {
    console.warn('[socket] emitToUser skipped:', e);
  }
}

export function emitFriendshipSync(...userIds: number[]): void {
  const unique = [...new Set(userIds.filter((id) => Number.isFinite(id)))];
  for (const id of unique) {
    emitToUser(id, 'friendship:sync', {});
  }
}
