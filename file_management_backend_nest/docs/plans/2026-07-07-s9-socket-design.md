# S9 Socket Gateway — 设计文档

> 日期：2026-07-07  
> 状态：已评审（与 Express `src/realtime/socket.ts` 行为对齐）

## 目标

将 Express Socket.IO 实时通道迁入 Nest，补齐 S8 留空的推送：

| 事件 | 触发场景 |
|------|----------|
| `message:new` | `POST /api/messages` 成功后推送给接收方 |
| `friendship:sync` | 好友请求/接受/拒绝/删除后推送给相关用户 |

## 非目标（S9 不做）

- VIP 审核自动消息推送（Express `vip.controller`，留 S10）
- 管理员通知消息（Express `auth.controller`，留 S10）

## 架构

```
src/realtime/
  contacts.gateway.ts      # @WebSocketGateway path=/socket.io，握手中间件 + join user:{id}
  realtime-emitter.service.ts  # emitToUser / emitFriendshipSync（供 Message/Friendship 注入）
  socket-auth.util.ts      # JWT + sessionVersion + mustChangePassword 校验（对齐 Express）
  realtime.module.ts       # 导出 RealtimeEmitterService；AuthModule + RedisModule
```

- **Redis Adapter**：`RedisService.getClient()` 可用时挂 `@socket.io/redis-adapter`，否则单进程模式。
- **CORS**：与 Express `matchSocketCorsOrigin` 一致（localhost 任意端口 + `CORS_ORIGIN`）。
- **握手 Token**：`handshake.auth.token` 或 `handshake.query.token`（与前端 `contactsSocket.ts` 一致）。

## Friendship 推送用户 ID（对齐 Express）

| 操作 | emit 目标 |
|------|-----------|
| 发请求 | `friend.id` |
| 接受/拒绝 | `userId`, `friendship.userId` |
| 删除好友 | `userId`, `friendId` |

## 验收

1. **e2e**：无 Token 握手失败；合法 Token 连接成功；REST 发消息后接收方 socket 收到 `message:new`；好友操作后收到 `friendship:sync`
2. **手测**：双浏览器账号，好友面板实时收消息/好友列表刷新
3. `pnpm build` + `pnpm test:e2e` 全绿

## 前端

无需改代码：`contactsSocket.ts` 已连 `VITE_API_BASE_URL`，事件名一致。
