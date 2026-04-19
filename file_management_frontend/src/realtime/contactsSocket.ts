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
  socket = io(API_BASE, {
    auth: { token },
    transports: ['websocket', 'polling'],
  })
  socket.on('message:new', (p: { message: Record<string, unknown> }) => handlers.onMessageNew?.(p))
  socket.on('friendship:sync', () => handlers.onFriendshipSync?.())
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
