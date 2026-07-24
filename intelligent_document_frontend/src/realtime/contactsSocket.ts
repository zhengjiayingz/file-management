import { io, type Socket } from 'socket.io-client'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

export type ContactsSocketHandlers = {
  onMessageNew?: (payload: { message: Record<string, unknown> }) => void
  onFriendshipSync?: () => void
}

let socket: Socket | null = null
let handlers: ContactsSocketHandlers = {}

export function setContactsSocketHandlers(h: ContactsSocketHandlers) {
  handlers = h
}

export function connectContactsSocket(token: string) {
  if (!token) return
  disconnectContactsSocket()
  // 发起长连接
  socket = io(API_BASE, {
    // 在握手时把 JWT 交给服务端，对应后端的 socket.handshake.auth.token，用于 io.use 里验身份。
    auth: { token },
    // 优先用 WebSocket；环境不支持时再 HTTP 长轮询，提高兼容性
    transports: ['websocket', 'polling'],
  })
  // 注册服务端推送事件 message:new 的监听器；收到时把数据交给外部通过 setContactsSocketHandlers 设置的 onMessageNew
  socket.on('message:new', (p: { message: Record<string, unknown> }) => handlers.onMessageNew?.(p))
  // 注册 friendship:sync：好友关系/申请有变时，服务端会推，这里转给 onFriendshipSync（如重新拉好友列表、待处理请求）
  socket.on('friendship:sync', () => handlers.onFriendshipSync?.())
  // 建连失败（如鉴权失败、网络、CORS）时不抛异常阻塞，只在控制台警告，避免打断页面；重连由 Socket.IO 自己策略或用户再次登录/手动重连时再走 connectContactsSocket
  socket.on('connect_error', (err: Error) => {
    console.warn('[contactsSocket]', err.message)
  })
}

export function disconnectContactsSocket() {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}

export function isContactsSocketConnected() {
  return socket?.connected ?? false
}
