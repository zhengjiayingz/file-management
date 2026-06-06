# Redis 常见面试题与参考答案

> 面向 Node 后端岗位（初级～中级）。可结合本仓库补强路线：[NODE_BACKEND_STRENGTHENING.md](./NODE_BACKEND_STRENGTHENING.md) **阶段二**（Redis 连接、登录限流、Socket.IO Redis Adapter、后续 BullMQ 预览队列）。

---

## 一、Redis 是什么？

### 1. 用一句话怎么介绍 Redis？

**答：**

**Redis**（Remote Dictionary Server）是一个开源的 **内存键值数据库**（in-memory key-value store），也常被当作 **缓存、分布式协调组件、轻量消息中间件** 使用。

- 和 **MySQL** 一样，是**独立进程**，应用通过客户端连接（Node 里常用 **`ioredis`**），默认端口 **6379**。
- 和 **MySQL** 不同，数据**主要在内存**，读写延迟低（微秒～毫秒级）。
- 支持 **过期时间 TTL**、**原子自增 INCR**、**发布/订阅 Pub/Sub** 等能力。
- 典型连接串：`redis://127.0.0.1:6379`

**口述模板：**

> Redis 是跑在内存里的 KV 存储，用来扛高并发读写和跨进程共享状态；业务持久化仍用 MySQL，Redis 是补充而不是替代。

---

### 2. Redis 和 MySQL 怎么分工？

| 维度 | MySQL | Redis |
|------|--------|--------|
| 存储介质 | 主要在磁盘 | 主要在内存 |
| 擅长 | 持久化业务数据、事务、复杂查询 | 高频读写、临时状态、跨实例共享 |
| 典型数据 | 用户、文件元数据、消息记录 | 限流计数、缓存、Pub/Sub、队列 |
| 丢了能否接受 | 一般不能 | 很多场景可重建（缓存、限流计数） |

---

## 二、Redis 主要解决什么问题？

### 3. 为什么需要 Redis？不用行不行？

**答（分场景）：**

| 问题 | 不用 Redis | 用 Redis |
|------|------------|----------|
| **读库压力大** | 每次都查 MySQL | 热点数据缓存，降低 DB QPS |
| **多实例状态不一致** | 限流、计数写在 Node 进程内存，开 2 个进程各算各的 | 计数放 Redis，**所有 API 实例共享** |
| **水平扩展后推送失败** | 用户 WebSocket 连在 B 机，emit 在 A 机，B 收不到 | Redis Pub/Sub + Socket Adapter **跨节点广播** |
| **耗时任务阻塞 HTTP** | 预览转码等卡在请求里 | 任务进 **队列**（Bull/BullMQ），Worker 异步消费 |

**核心矛盾两类：**

1. **性能**：内存访问快，适合缓存与高频计数。  
2. **分布式**：多台 API 需要看到**同一份**限流计数、同一条广播消息。

---

### 4. 单机内存限流和 Redis 限流有什么区别？（高频追问）

**答：**

- **进程内存**：`express-rate-limit` 默认 store 只在**当前 Node 进程**有效。  
  - 开 2 个 API 实例 → 每个实例各允许 N 次 → 实际相当于 **2N 次**，防刷容易失效。
- **Redis store**：计数 key 存在 Redis（如 `rl:login:ip:192.168.1.1`），**所有实例读写同一份** → 真正的**分布式限流**。

本仓库阶段二任务：**`POST /api/auth/login`** 使用 Redis store；无 Redis 时 fallback 内存并打 warn（开发/CI 仍可跑）。

---

## 三、Redis 常见用法

### 5. 缓存（Cache）

**做什么：** 把热点数据（用户信息、配置、列表）放 Redis；先查 Redis，未命中再查 DB 并回写。

**解决：** 降低 MySQL 压力、缩短接口响应时间。

**注意（加分项）：** 设置 TTL；了解缓存穿透、击穿、雪崩的概念即可，不必展开公式。

---

### 6. 限流 / 计数（Rate Limiting）

**做什么：** 对 key 做原子 `INCR`，配合 `EXPIRE` 或滑动窗口；工程上常用 `express-rate-limit` + `rate-limit-redis`。

**解决：** 防登录暴力破解、防接口被刷；**多实例共享计数**。

**本仓库示例：**

- 规则：同一 IP，15 分钟最多 10 次登录尝试（可 env 配置）。
- 超限：HTTP **429**，JSON `{ success: false, message: '...' }`。

---

### 7. 发布/订阅（Pub/Sub）与 Socket 多实例

**做什么：**

- 实例 A `PUBLISH` 到频道，实例 B `SUBSCRIBE` 收到后处理。
- **Socket.IO** 使用 **`@socket.io/redis-adapter`**，把「房间广播」从单进程内存扩展到所有 Node 实例。

**解决：** API **水平扩展**后，实时消息仍能到达连在任意实例上的客户端。

**本仓库场景：**

```text
用户浏览器 ──WebSocket──► API 进程 :3001
发消息逻辑在 ──► API 进程 :3000 里 emitToUser('message:new')
无 Adapter：3001 上的用户收不到
有 Redis Adapter：经 Redis 转发，3001 也能收到
```

#### 7.1 心智模型：本质就是发布/订阅

可以把它理解成：

> 各实例在 Redis 上**订阅** Adapter 约定的内部频道；某实例 **发布** 一条「往 room X 广播 event Y」的指令；其它实例收到后，**回本机查** room X 里有没有 socket，有则通过 WebSocket 推给客户端。

注意两个常见误区：

| 误区 | 更准确的说法 |
|------|----------------|
| Redis 订阅的是业务频道 `message:new` | **不是**。`message:new` 是 Socket.IO **事件名**，打在广播**包体**里；Redis 频道是 Adapter **内部协议**（带 `socket.io` 等前缀，无需手写） |
| Redis 存着「B 连在哪台实例」 | **不是**。WebSocket 连接和 `socket.join('user:B')` 的 room 表都在**各实例本机内存**；Redis 只传广播指令，不传连接 |

#### 7.2 本仓库两条 Redis 连接（pub / sub）

挂载 Adapter 时（`src/realtime/socket.ts`）：

```typescript
const redis = getRedis();           // 单例，pub 端 + 登录限流共用
const subClient = redis.duplicate(); // 另开一条连接，专做 SUBSCRIBE
await subClient.connect();
io.adapter(createAdapter(redis, subClient));
```

| 连接 | 来源 | 用途 |
|------|------|------|
| **pubClient** | `getRedis()` 单例 | Adapter 发 `PUBLISH`；登录限流 `INCR` 等普通命令 |
| **subClient** | `redis.duplicate()` | Adapter 长期 `SUBSCRIBE`，监听其它实例的广播 |

**为何 duplicate？** Redis Pub/Sub 要求订阅连接长期停在「听消息」状态，不能和 publish、限流计数挤在同一条连接上。

每个 Node 进程 = **1 个单例 + 1 个 duplicate**；开两个后端实例（3000 / 3001）≈ **4 条** Redis TCP 连接，属正常情况。

#### 7.3 发一条消息的完整流程（Vue → 3000，B 的 WebSocket 在 3001）

**角色：**

- 实例 A：`PORT 3000`，Vue 的 REST 走这里
- 实例 B：`PORT 3001`，React 用户 B 的 WebSocket 连这里
- MySQL：共享，谁收到 REST 谁写库
- Redis：Adapter 的 Pub/Sub 中转，**不存消息正文**

**步骤：**

```text
【启动】
  app.ts: await connectRedis()     → A、B 各连同一 Redis
  app.ts: await initSocket()       → 各挂 createAdapter(pub, sub)

【连接】
  A 连 3000 → socket.join('user:A')   （只在 A 本机内存）
  B 连 3001 → socket.join('user:B')   （只在 B 本机内存）

【发消息】
  Vue POST /api/messages → 实例 A
    → prisma.message.create（MySQL）
    → emitToUser(B, 'message:new', { message: full })
    → getIo().to('user:B').emit('message:new', payload)

【Adapter 介入 — 实例 A】
  1. 先查 A 本机 user:B 房间（通常为空，B 不在 A 上）
  2. pubClient 把「room=user:B, event=message:new, payload=...」PUBLISH 到 Redis 内部频道

【Redis】
  fan-out 给所有已 SUBSCRIBE 的实例（A、B、…）

【Adapter 介入 — 实例 B】
  1. subClient 收到广播包，解析出 room、event、payload
  2. 查 B 本机 user:B 房间 → 找到 B 的 socket
  3. WebSocket 推出 message:new → React 实时显示

【HTTP】
  实例 A 同时返回 201 给 Vue
```

**ASCII 流程图：**

```text
Vue ──REST POST /messages──► 实例 A :3000
                              │
                              ├─► MySQL 落库
                              │
                              └─► emitToUser(B, 'message:new')
                                        │
                                        ▼
                                 Redis Adapter (pub)
                                        │
                                        ▼
                                     Redis Pub/Sub
                                        │
                                        ▼
React ◄──WS message:new── 实例 B :3001 ◄── Redis Adapter (sub)
         （B 的 socket 在 user:B 房间）
```

#### 7.4 和登录限流用的 Redis 有何不同？

同属一个 `REDIS_URL`、同一个 `getRedis()` 单例，但**用途分离**：

| 能力 | Redis 用法 | 典型 key / 频道 |
|------|------------|-----------------|
| **登录限流** | `INCR` + TTL（KV） | `rl:login:...` |
| **Socket Adapter** | `PUBLISH` / `SUBSCRIBE`（Pub/Sub） | Adapter 内部频道，非业务事件名 |

发消息走 Adapter Pub/Sub；`POST /login` 走限流 KV。**互不干扰。**

#### 7.5 无 Redis / 无 Adapter 时

| 情况 | MySQL 写库 | 实时 `message:new` |
|------|------------|---------------------|
| 有 Redis + Adapter | ✅ | ✅ 跨实例可达 |
| 无 Redis | ✅ | ⚠️ 仅接收方 WebSocket **所在实例**能推 |
| REST 与 WS 在同一实例 | ✅ | ✅ 即使无 Adapter 也行 |

无 Adapter 时 B 仍可能看到未读，是因为 `GET /messages/unread-summary` 等 **HTTP 轮询 + 共用 MySQL**，不是 Socket 跨实例成功。

#### 7.6 面试一句话（Pub/Sub + Adapter）

> Socket.IO 默认只在进程内存里广播；挂上 Redis Adapter 后，每次 `io.to(room).emit` 会经 Redis Pub/Sub 同步到所有 API 实例，各实例再向本机 room 里的 socket 投递。业务只调 `emitToUser`，不用关心客户端连在哪台机器。

本地双实例验收步骤见 [notes/SOCKET_MULTI_INSTANCE.md](./notes/SOCKET_MULTI_INSTANCE.md)。Socket 握手、房间、JWT 等见 [WEBSOCKET_SOCKET_INTERVIEW_QA.md](./WEBSOCKET_SOCKET_INTERVIEW_QA.md)。

---

### 8. 消息队列（Queue）

**做什么：** Bull / **BullMQ** 把任务（预览转码、发通知）写入 Redis，Worker 进程异步消费。

**解决：** 削峰、解耦、HTTP 快速返回；任务可持久、可重试。

**本仓库：** 阶段五预览任务队列（与阶段二 Redis 基础设施复用）。

---

### 9. 其他常见用法（一句带过）

| 用法 | 说明 |
|------|------|
| 分布式锁 | `SET key NX EX`，协调多实例抢资源 |
| 分布式 Session | 会话存 Redis，多实例共享登录态 |
| 排行榜 | Sorted Set（ZSET）按分数排序 |
| 地理位置 | Geo 命令（附近的人等） |

---

## 四、结合本项目的说法（简历 / 项目介绍）

### 10. 你们项目里 Redis 用在哪？

**答（建议 20～30 秒）：**

> 业务数据仍在 **MySQL + Prisma**。引入 Redis 主要为了：  
> 1. **登录限流**——多 API 实例共享 IP 计数，防撞库；  
> 2. **Socket.IO Redis Adapter**——水平扩展后 `message:new` 等事件能跨节点推送；  
> 3. 后续 **BullMQ** 做 Office/PDF 等预览转码异步任务。  
> 开发环境未配置 `REDIS_URL` 时可降级（内存限流、不挂 Adapter）并打日志；生产通过 Docker Compose 注入 Redis。

对应实施清单：[NODE_BACKEND_实施任务清单.md](./NODE_BACKEND_实施任务清单.md) **阶段二**。

---

## 五、常见追问

### 11. Redis 为什么快？

- 数据主要在 **内存**，无磁盘随机 IO 瓶颈（持久化时才有磁盘写入）。
- 单线程处理命令，避免多线程锁竞争（6.0+ 也有多线程 IO 优化网络）。
- 数据结构简单，协议轻量。

---

### 12. Redis 数据会丢吗？

- 纯内存，进程宕机可能丢失未持久化数据。
- 可配置 **RDB 快照**、**AOF 日志** 做持久化。
- **缓存、限流计数** 很多场景丢失后可重建；**队列任务** 需结合 Bull 持久化策略说明。

---

### 13. Redis 和 Memcached 的区别？

| | Redis | Memcached |
|---|--------|-----------|
| 数据结构 | 字符串、哈希、列表、集合、ZSet 等 |  mainly 字符串 |
| 持久化 | 支持 RDB/AOF | 不支持 |
| Pub/Sub | 支持 | 不支持 |
| 典型场景 | 缓存 + 限流 + 队列 + 协调 | 纯缓存 |

---

### 14. 限流常用哪些算法？

- **固定窗口**：实现简单，窗口边界可能突发双倍流量。
- **滑动窗口**：更平滑，实现稍复杂。
- **令牌桶 / 漏桶**：适合平滑限流、允许一定突发。

工程上常用成熟中间件（`express-rate-limit`）+ Redis store，不必手写算法。

---

### 15. 为什么限流不用 MySQL 记次数？

每次登录失败都 `UPDATE` 一张计数表，**写压力大、延迟高**；Redis 的 `INCR` 是内存原子操作，更适合高频计数。

---

### 16. CI 里没有 Redis 怎么办？

- 测试 Job 可只起 MySQL（见 `.github/workflows/backend-ci.yml`）。
- 代码设计：**无 `REDIS_URL` 时** 限流 fallback 内存 store，Socket 不挂 Adapter，并 `warn`。
- 生产环境 Docker Compose 提供 Redis 服务。

---

## 六、极简背诵版（三句话）

1. **Redis 是什么**：内存 KV 数据库，独立服务，读写快，支持 TTL、计数、Pub/Sub。  
2. **解决什么**：缓存减压、**多实例共享状态**（限流）、**跨节点实时推送**、异步任务队列。  
3. **常见用法**：缓存、限流、Pub/Sub（含 Socket Adapter）、消息队列；本项目重点在 **登录限流 + Socket 多实例 + 预览队列**。

---

## 七、相关文档

| 文档 | 说明 |
|------|------|
| [NODE_BACKEND_STRENGTHENING.md](./NODE_BACKEND_STRENGTHENING.md) | 补强总纲（M2 Redis） |
| [NODE_BACKEND_实施任务清单.md](./NODE_BACKEND_实施任务清单.md) | 阶段二具体任务 |
| [WEBSOCKET_SOCKET_INTERVIEW_QA.md](./WEBSOCKET_SOCKET_INTERVIEW_QA.md) | Socket 与 Redis Adapter 面试题 |
| [notes/SOCKET_MULTI_INSTANCE.md](./notes/SOCKET_MULTI_INSTANCE.md) | 多实例本地验收（端口、前端配置） |

---

**更新日期**：2026-06-06
