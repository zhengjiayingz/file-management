# Socket.IO 多实例广播（Redis Adapter）

## 背景

单进程 Socket.IO 时，`emitToUser()` 只对本机已连接的客户端有效。

水平扩展（多个 Node 进程 / 多个 PORT）后，用户 A 连实例 1、用户 B 连实例 2。若 REST 请求落在实例 1，默认 `io.to('user:B').emit(...)` **不会** 到达实例 2 上的 B。

本项目通过 **`@socket.io/redis-adapter`** + **Redis Pub/Sub**，让各实例的 `emit` 经 Redis 同步到其他实例。

## 架构（ASCII）

```
┌─────────────┐     REST POST /messages      ┌─────────────┐
│  Vue 前端   │ ───────────────────────────► │  实例 A     │
│  :5173      │     WebSocket → :3000        │  PORT 3000  │
└─────────────┘                              │  emitToUser │
                                             └──────┬──────┘
                                                    │ publish
                                                    ▼
                                             ┌─────────────┐
                                             │    Redis    │
                                             │  Pub/Sub    │
                                             └──────┬──────┘
                                                    │ subscribe
                                                    ▼
┌─────────────┐     WebSocket → :3001        ┌─────────────┐
│ React 前端  │ ◄──────────────────────────── │  实例 B     │
│  :5174      │     message:new               │  PORT 3001  │
└─────────────┘                              └─────────────┘
```

**一句话**：实例 A 上 `emitToUser(bobId, 'message:new', payload)` → Redis → 实例 B 向 `user:bobId` 房间推送，React 客户端收到。

## 代码位置

| 文件 | 作用 |
|------|------|
| `src/lib/redis.ts` | `connectRedis()` / `getRedis()`，读 `REDIS_URL` |
| `src/app.ts` | 启动前 `await connectRedis()`；shell 传入的 `PORT` 优先（多实例） |
| `src/realtime/socket.ts` | Redis 可用时 `io.adapter(createAdapter(pub, sub))` |
| `src/realtime/socket.ts` | `emitToUser()` → `getIo().to('user:${id}').emit(...)` |
| `src/controllers/message.controller.ts` | 发消息后调用 `emitToUser` |

Adapter 要点：

- **pubClient**：复用 `getRedis()` 已有连接
- **subClient**：必须 `redis.duplicate()`，订阅与发布不能共用同一连接

无 Redis 时：不挂 Adapter，日志 `[socket] Redis 不可用，Socket 仅当前 Node 进程有效`，单实例仍可用。

## 本地验收

**前置**：Docker Redis 运行，`REDIS_URL=redis://127.0.0.1:6379`

**终端 1 — 实例 A**

```powershell
cd file_management_backend
pnpm dev
# [redis] Redis 连接成功
# [socket] Redis Adapter 已启用（多实例可广播）
# Server is running on port 3000
```

**终端 2 — 实例 B**

```powershell
cd file_management_backend
$env:PORT='3001'; pnpm dev
# Server is running on port 3001
```

**前端**

| 前端 | 地址 | API / WebSocket |
|------|------|-----------------|
| Vue | http://localhost:5173 | `VITE_API_BASE_URL=http://localhost:3000` |
| React | http://localhost:5174 | `VITE_API_BASE_URL=http://localhost:3001` |

**步骤**

1. Vue 登录用户 A，React 登录用户 B（互为好友）
2. 两边打开消息面板，确认 WebSocket 已连
3. 在 **Vue（连 3000）** 给 B 发消息
4. **React（WebSocket 连 3001）** 仍能收到 `message:new`

**结论**：REST 落在实例 A、客户端连实例 B 时，实时推送仍可达 → 多实例 + Redis Adapter 生效。

## 面试一句话

> 我们用 Socket.IO Redis Adapter 做跨进程广播：业务只调 `emitToUser`，Adapter 通过 Redis Pub/Sub 把事件同步到所有 API 实例，客户端连任意实例都能收到推送；Redis 不可用时降级为单进程内存广播。
