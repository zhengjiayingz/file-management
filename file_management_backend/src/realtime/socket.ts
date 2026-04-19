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
    path: '/socket.io',
    cors: {
      origin: matchSocketCorsOrigin,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token =
        (typeof socket.handshake.auth?.token === 'string' && socket.handshake.auth.token) ||
        (typeof socket.handshake.query?.token === 'string' && socket.handshake.query.token);
      if (!token) {
        next(new Error('未提供认证令牌'));
        return;
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, status: true, mustChangePassword: true },
      });
      if (!user || user.status !== 'active') {
        next(new Error('认证无效'));
        return;
      }
      if (user.mustChangePassword) {
        next(new Error('请先修改临时密码后再使用实时通讯'));
        return;
      }
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('无效的认证令牌'));
    }
  });

  io.on('connection', (socket) => {
    const uid = socket.data.userId as number;
    socket.join(`user:${uid}`);
  });

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
