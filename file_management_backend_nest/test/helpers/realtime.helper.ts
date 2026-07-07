import { io, type Socket } from 'socket.io-client';
import type { E2eApp } from './app-bootstrap';

export async function listenE2eApp(app: E2eApp): Promise<number> {
  await app.listen(0);
  const addr = app.getHttpServer().address();
  if (!addr || typeof addr === 'string') {
    throw new Error('无法获取 e2e 监听端口');
  }
  return addr.port;
}

export function connectSocket(
  port: number,
  token: string,
  timeoutMs = 8000,
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const client = io(`http://127.0.0.1:${port}`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    const timer = setTimeout(() => {
      client.close();
      reject(new Error('socket connect timeout'));
    }, timeoutMs);
    client.on('connect', () => {
      clearTimeout(timer);
      resolve(client);
    });
    client.on('connect_error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export function connectSocketExpectFailure(
  port: number,
  token: string | undefined,
  timeoutMs = 8000,
): Promise<Error> {
  return new Promise((resolve, reject) => {
    const client = io(`http://127.0.0.1:${port}`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      forceNew: true,
    });
    const timer = setTimeout(() => {
      client.close();
      reject(new Error('expected connect_error but timed out'));
    }, timeoutMs);
    client.on('connect', () => {
      clearTimeout(timer);
      client.close();
      reject(new Error('expected connect_error but connected'));
    });
    client.on('connect_error', (err: Error) => {
      clearTimeout(timer);
      client.close();
      resolve(err);
    });
  });
}

export function waitForSocketEvent<T>(
  socket: Socket,
  event: string,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${event}`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

export function disconnectSocket(socket: Socket | null) {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
}
