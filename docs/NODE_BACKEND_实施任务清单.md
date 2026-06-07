# Node 后端补强 — 实施任务清单（照着做即可）

> **你怎么用这份文档**  
> 1. 从上到下按顺序做，**做完一项勾一项**（`- [ ]` → `- [x]`）。  
> 2. 总纲与面试话术见 [NODE_BACKEND_STRENGTHENING.md](./NODE_BACKEND_STRENGTHENING.md)。  
> 3. 本文只回答：**今天要写什么文件、跑什么命令、怎样算做完**。  
> **更新日期**：2026-06-03  
> **工作目录**：`file_management_backend/`

---

## 0. 开工前（30 分钟，只做一次）

| # | 你要做的事 | 做完的标志 |
|---|------------|------------|
| 0.1 | 确认本机能跑：`pnpm dev`、MySQL 正常、`GET http://localhost:3000/health` 返回 ok | 浏览器或 curl 看到 JSON |
| 0.2 | 复制 `.env` 为 `.env.test`（或单独 `DATABASE_URL` 指向测试库 `file_mgmt_test`） | 测试**绝不**删生产库 |
| 0.3 | 新建分支 `feat/node-hardening` | `git checkout -b feat/node-hardening` |
| 0.4 | 安装 Redis（本地或 Docker 一条命令） | `redis-cli ping` 返回 `PONG` |

```bash
# 仅 Redis（本机没有时）
docker run -d --name redis-dev -p 6379:6379 redis:7-alpine
```

**今天若只干一件事**：完成 **阶段一 → 任务 1.1**，让 `pnpm test` 能跑起来（哪怕只有 1 个用例）。

---

## 阶段一：测试（必做，约 3～5 天）

> **用户故事**：作为开发者，我改登录逻辑后跑一条命令就能知道有没有弄坏接口。

### 任务 1.1 — 搭测试脚手架

- [x] **1.1.1** 安装依赖（在 `file_management_backend` 下执行）：

```bash
pnpm add -D vitest supertest @types/supertest
```

- [x] **1.1.2** 新建 `vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30_000,
    fileParallelism: false, // 集成测试串行，避免共库冲突
  },
});
```

- [x] **1.1.3** 新建 `tests/setup.ts`：加载 `dotenv` 且优先读 `.env.test`；设置 `NODE_ENV=test`。

- [x] **1.1.4** 修改 `package.json`：

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [x] **1.1.5** 新建 `tests/health.test.ts`：对 `app` 发 `GET /health`，断言 `status === 'ok'`。

**你需要改/建的文件**

| 操作 | 路径 |
|------|------|
| 新建 | `vitest.config.ts` |
| 新建 | `tests/setup.ts` |
| 新建 | `tests/health.test.ts` |
| 修改 | `package.json` |

**怎样算做完**

```bash
pnpm test
# 输出：1 passed
```

**注意**：`app.ts` 里 `httpServer.listen` 会在 import 时启动。测试里应 **只 export app、不 listen**，或抽 `src/createApp.ts` 供测试 import。推荐做法见任务 1.1.6。

---

### 任务 1.1.6 — 拆分应用入口（测试必做）

- [x] 新建 `src/createApp.ts`：把 `app.ts` 里「创建 express、挂中间件和路由」挪进去，**export `createApp()`**。
- [x] `app.ts` 改为：`createApp()` + `createServer` + `initSocket` + `listen` + `initCleanupJob`。
- [x] 测试文件：`import { createApp } from '../src/createApp.js'`，`const app = createApp()`，**不要 listen**。

**做完标志**：`pnpm test` 仍通过，且跑测试时终端**不会**打印「Server is running on port 3000」（或端口不冲突）。

---

### 任务 1.2 — 认证接口集成测试

- [x] **1.2.1** 新建 `tests/helpers/seed.ts`：
  - 函数 `createTestUser(prisma, { username, password })`  
  - 函数 `cleanupTestUsers(prisma, prefix: 'test_')` — 只删用户名以 `test_` 开头的用户  

- [x] **1.2.2** 新建 `tests/auth.integration.test.ts`，至少包含：

| 用例编号 | 场景 | 请求 | 期望 |
|----------|------|------|------|
| A1 | 无 Token 访问受保护接口 | `GET /api/auth/me` 无头 | 401 |
| A2 | 登录成功 | `POST /api/auth/login` 正确账号密码 | 200，`data.accessToken` 存在 |
| A3 | 带 Token 访问 | `GET /api/auth/me` Bearer | 200，`data.username` 正确 |
| A4 | Refresh | `POST /api/auth/refresh` 带 refreshToken | 200，新 accessToken |
| A5 | 错误密码 | `POST /api/auth/login` 错密码 | 401 |

- [x] **1.2.3** `beforeEach`：清理 `test_` 用户；`beforeAll`：跑一次 `prisma migrate deploy`（指向测试库）。

**做完标志**：`pnpm test` 至少 **5 passed**（health + auth）。

**手动自测（与自动化等价）**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"你的测试用户\",\"password\":\"xxx\"}"
```

---

### 任务 1.3 — 消息接口集成测试

- [x] **1.3.1** seed 两个用户 `test_alice`、`test_bob`，并插入一条已通过的 `Friendship`（或调用你现有的好友逻辑）。
- [x] **1.3.2** 新建 `tests/message.integration.test.ts`：

| 用例 | 步骤 | 期望 |
|------|------|------|
| M1 | alice 登录后发消息给 bob | 201/200，返回 message id |
| M2 | bob 登录拉与 alice 的会话历史 | 列表含刚发的内容 |
| M3 | 非好友发消息 | 403 或业务错误码（与现网一致） |

**涉及现有代码**（只读对照，不必改业务）：

- `src/routes/message.routes.ts`
- `src/controllers/message.controller.ts`

---

### 任务 1.4 — 密码策略单测

- [ ] 新建 `tests/passwordPolicy.test.ts`，直接 import `passwordPolicy.service`。
- [ ] 至少 5 组：`合法密码`、`太短`、`缺大写`、`缺数字`、`管理员改策略后仍校验`。

**做完标志**：`pnpm test` ≥ 10 passed。

---

### 任务 1.5 — GitHub Actions CI

- [x] 新建 `.github/workflows/backend-ci.yml`：

```yaml
name: Backend CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8
        env:
          MYSQL_ROOT_PASSWORD: test
          MYSQL_DATABASE: file_mgmt_test
        ports: ['3306:3306']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install
        working-directory: file_management_backend
      - run: pnpm exec prisma migrate deploy
        working-directory: file_management_backend
        env:
          DATABASE_URL: mysql://root:test@127.0.0.1:3306/file_mgmt_test
      - run: pnpm test
        working-directory: file_management_backend
        env:
          DATABASE_URL: mysql://root:test@127.0.0.1:3306/file_mgmt_test
          JWT_SECRET: test-secret-min-32-chars-long!!!!
```

- [x] push 后 GitHub 显示绿勾。

**阶段一完成标准（整阶段勾选）**

- [x] `pnpm test` 本地稳定通过  
- [x] CI 绿  
- [x] 已提交 `createApp` 拆分（否则后续阶段测试会痛苦）  

---

## 阶段二：Redis + 登录限流 + Socket 多实例（必做，约 3～4 天）

> **用户故事**：作为运维，我多开两个 API 进程时，登录防刷仍有效，且用户连任意实例都能收到 Socket 推送。

### 任务 2.1 — Redis 连接模块

- [x] 安装：`pnpm add ioredis`
- [x] 新建 `src/lib/redis.ts`：`getRedis()` 单例；`connectRedis()` / `disconnectRedis()`；未配置 `REDIS_URL` 时 dev 可 warn 并返回 null。
- [x] 在 `app.ts` 启动时 `await connectRedis()`（listen 之前）。
- [x] `.env.example` 增加：`REDIS_URL=redis://127.0.0.1:6379`

**做完标志**：启动日志有 `Redis connected`（或明确 skipped）。

---

### 任务 2.2 — 登录限流

- [x] 安装：`pnpm add express-rate-limit rate-limit-redis`
- [x] 新建 `src/middleware/rateLimit.middleware.ts`：
  - `loginRateLimiter`：仅用于 `POST /api/auth/login`
  - window 15 分钟，max 10（读 env）
  - store 使用 Redis（无 Redis 时 fallback memory 并打 warn）
- [x] 修改 `src/routes/auth.routes.ts`：`router.post('/login', loginRateLimiter, login)`

**手动验收**

1. 连续错登 11 次同一 IP → 第 11 次返回 **429**。  
2. 响应 JSON 形如 `{ success: false, message: '...' }`（与项目统一格式）。

---

### 任务 2.3 — Socket.IO Redis Adapter

- [x] 安装：`pnpm add @socket.io/redis-adapter`
- [x] 修改 `src/realtime/socket.ts`：在 `initSocket` 里，若 Redis 可用则：

```ts
import { createAdapter } from '@socket.io/redis-adapter';
// pubClient / subClient 各一个 ioredis 实例
io.adapter(createAdapter(pubClient, subClient));
```

- [x] 写 `docs/notes/SOCKET_MULTI_INSTANCE.md`（半页即可）：画 ASCII 图「实例 A emit → Redis → 实例 B 客户端收到」。

**做完标志（本地）**

1. 终端 1：`PORT=3000 pnpm dev`  
2. 终端 2：`PORT=3001 pnpm dev`（改 env 或命令行）  
3. 前端/脚本连 3001，发消息逻辑在 3000 触发 `emitToUser` → 3001 的客户端仍能收到 `message:new`。

---

### 任务 2.4 — docker-compose 加入 Redis

- [x] 在后续 M6 的 compose 里先有 redis 服务；本阶段可临时建 `docker-compose.dev.yml` 仅含 redis。

**阶段二完成标准**

- [x] 登录 429 可复现  
- [x] 双实例 Socket 文档 + 你本地试过至少一次  
- [ ] `tests` 可加一条：mock 限流或跳过（CI 无 Redis 时用 memory store 也要绿）  

---

## 阶段三：安全中间件（必做，约 1～2 天）

> **用户故事**：作为安全评审，生产环境有基础 HTTP 安全头，且接口不会被无脑刷爆。

### 任务 3.1 — Helmet

- [x] `pnpm add helmet`
- [x] `createApp.ts` 里：`if (process.env.NODE_ENV === 'production') app.use(helmet())`

### 任务 3.2 — 全局限流

- [x] 在 `createApp.ts` 挂 `apiRateLimiter`：例如每 IP 每分钟 300 次，挂在 `/api` 之前。
- [x] **白名单**：`/health`、`/api-docs` 可不限制或更高阈值。

### 任务 3.3 — 生产 CORS 文档

- [x] 在 `README.md` 写一节「生产部署」：必须设 `CORS_ORIGIN=https://你的前端域名`，禁止 `*` + credentials。
- [x] `.env.example` 注释写清。

**阶段三完成标准**

- [x] `NODE_ENV=production` 本地启动，响应头含 `X-Content-Type-Options` 等  
- [x] 用脚本快速请求 `/api/auth/password-policy` 超过 300 次/分钟 → 429  

---

## 阶段四：日志 + 健康检查（必做，约 2 天）

> **用户故事**：出问题时我能用 requestId 在日志里串起一条请求；负载均衡能根据 `/health` 摘掉坏节点。

### 任务 4.1 — Pino 请求日志

- [ ] `pnpm add pino pino-http`
- [ ] 新建 `src/lib/logger.ts`：export `logger`
- [ ] `createApp.ts` 最前：`pino-http` 生成 `req.log`，自定义 `genReqId`
- [ ] 把 `error.middleware.ts` 里 `console.error` 改为 `req.log?.error` 或 `logger.error`
- [ ] 把 `cleanup.job.ts`、`socket.ts` 关键 warn 改为 `logger.warn`

**禁止**：日志里打印完整 `password`、`refreshToken`、`Authorization`。（脱敏）

### 任务 4.2 — 增强健康检查

- [ ] 改 `GET /health`：
  - `checks.mysql`：`prisma.$queryRaw\`SELECT 1\``  
  - `checks.redis`：`redis.ping()`（未配置则 `skipped`）  
  - 任一 required 失败 → HTTP **503**，`status: 'degraded'`
- [ ] 可选：拆 `GET /health/live`（只返回 ok）与 `GET /health/ready`（含依赖）

**阶段四完成标准**

- [ ] 停掉 Redis 后 `ready` 返回 503（若 Redis 标为 required）  
- [ ] 打一条登录请求，日志里能看到 reqId + statusCode + durationMs  

---

## 阶段五：预览任务队列 BullMQ（必做，约 4～5 天）

> **用户故事**：用户点开大 PPT 预览时，HTTP 立即返回；转 PDF 在后台排队，服务重启后任务不丢。

### 任务 5.1 — 队列基础设施

- [ ] `pnpm add bullmq`
- [ ] 新建 `src/queues/preview.queue.ts`：队列名 `preview-convert`，连接 Redis。
- [ ] 新建 `src/workers/preview.worker.ts`：把现有 `processQueue` 里真正调 LibreOffice 的逻辑**搬进去**（或调用 preview.service 里抽出的纯函数）。

### 任务 5.2 — 改造 preview.service.ts

- [ ] 删除或废弃内存数组 `conversionQueue`、`isConverting`。
- [ ] `enqueueConversion(task)` → `previewQueue.add('convert', { op, fileHash, sourceFilePath, ... })`。
- [ ] 保留 `partialInFlight` Map 可做「同 hash 只入队一次」的 dedupe（用 jobId = fileHash+op）。

### 任务 5.3 — Worker 启动方式

- [ ] `package.json` 增加 `"worker:preview": "tsx src/workers/preview.worker.ts"`
- [ ] 开发：README 写「开两个终端：pnpm dev + pnpm worker:preview」
- [ ] 生产：compose 里可加 `worker` 服务，与 `api` 同镜像不同 command

### 任务 5.4 — 任务状态（可选但推荐）

- [ ] `GET /api/files/:id/preview-status` 或在现有预览接口里带 `jobState: waiting|active|completed|failed`
- [ ] 读 BullMQ `getJob(fileHash)` 状态

**阶段五完成标准**

- [ ] 上传一个 .pptx，触发预览，**关 API 只留 worker** 仍能继续转（或反过来验证队列持久）  
- [ ] API 进程重启后，Redis 里 waiting 的 job 仍被执行  
- [ ] 面试能讲：为何不用内存队列、失败重试 3 次  

**不要在本阶段做**：换 OSS、改前端 UI，除非只显示「转换中」。

---

## 阶段六：Docker 一键部署（必做，约 2～3 天）

> **用户故事**：面试官 clone 仓库后 `docker compose up` 能起服务并打开 Swagger。

### 任务 6.1 — Dockerfile

- [ ] 多阶段：stage1 `pnpm install && pnpm build`，stage2 只拷贝 `dist`、`node_modules`（production）、`prisma`
- [ ] 注意：预览依赖 LibreOffice 则镜像很大——**CI 镜像可不装 LibreOffice**，compose 里 api 服务注释「预览需本地 LibreOffice 或 worker 扩展镜像」

### 任务 6.2 — docker-compose.yml

- [ ] 服务：`mysql`、`redis`、`api`、可选 `worker`
- [ ] 环境变量：`DATABASE_URL`、`REDIS_URL`、`JWT_SECRET`、`CORS_ORIGIN`
- [ ] 卷：`uploads`、`previews`（或命名卷）
- [ ] `api` 依赖 mysql healthy；entrypoint：`prisma migrate deploy && node dist/app.js`

### 任务 6.3 — 文档

- [ ] 更新 `file_management_backend/README.md`：Docker 章节、常见问题（端口、权限、迁移失败）
- [ ] **重写** `PROJECT_STRUCTURE.md` 过时内容（内存存储、.js 命名改为 .ts + Prisma）

**阶段六完成标准**

- [ ] 新机器 10 分钟内：`docker compose up -d` → `curl localhost:3000/health` ok  
- [ ] Swagger `http://localhost:3000/api-docs` 可打开  

---

## 阶段七：对象存储抽象（可选，约 3 天）

> **做完阶段六再做**。不做也不影响中级面试主体。

- [ ] `src/storage/types.ts` 定义接口
- [ ] `src/storage/local.provider.ts` 包装现有 `uploads/`
- [ ] `upload.controller.ts` 里上传完成改为 `storage.put(...)`
- [ ] MinIO 本地容器 + `oss.provider.ts` 骨架，`STORAGE_DRIVER=minio` 能传 1 个小文件

---

## 阶段八：压测笔记（可选，约 1 天）

- [ ] `scripts/load/login.k6.js`
- [ ] `docs/PERFORMANCE_NOTES.md`：写 p95、瓶颈在 DB 还是磁盘、建议索引（`messages` 的 sender/receiver + createdAt）

---

## 附录 A：每天不知道干啥时 — 按日历拆

| 天 | 只做这些任务编号 |
|----|------------------|
| Day 1 | 0 + 1.1 + 1.1.6 |
| Day 2 | 1.2 |
| Day 3 | 1.3 + 1.4 |
| Day 4 | 1.5，修 CI 直到绿 |
| Day 5 | 2.1 + 2.2 |
| Day 6 | 2.3 + 2.4 |
| Day 7 | 3.1 + 3.2 + 3.3 |
| Day 8 | 4.1 + 4.2 |
| Day 9～11 | 5.1 → 5.4 |
| Day 12～13 | 6.1 → 6.3 |
| Day 14+ | 7、8 可选 |

---

## 附录 B：需求 → 你要写的代码（对照表）

| 我想具备的能力 | 对应任务 | 主要新增/修改文件 |
|----------------|----------|-------------------|
| 会写接口测试 | 阶段一 | `tests/*.test.ts`, `createApp.ts` |
| 会 Redis | 阶段二 | `src/lib/redis.ts` |
| 会限流 | 2.2、3.2 | `rateLimit.middleware.ts` |
| 会 Socket 横向扩展 | 2.3 | `socket.ts` + 说明 doc |
| 会安全头 | 3.1 | `createApp.ts` |
| 会结构化日志 | 4.1 | `logger.ts`, `error.middleware.ts` |
| 会健康检查 | 4.2 | `app.ts` 或 `health.routes.ts` |
| 会消息队列 | 阶段五 | `queues/`, `workers/`, `preview.service.ts` |
| 会 Docker | 阶段六 | `Dockerfile`, `docker-compose.yml` |
| 会 OSS | 阶段七 | `src/storage/*` |

---

## 附录 C：和产品需求文档的区别

| 文档 | 写什么 |
|------|--------|
| [REQUIREMENTS.md](./REQUIREMENTS.md) | 用户能看到的业务：好友、VIP、分享 |
| [NODE_BACKEND_STRENGTHENING.md](./NODE_BACKEND_STRENGTHENING.md) | 为什么要补强、里程碑、面试映射 |
| **本文** | **今天打开 IDE 具体改哪几个文件** |

---

## 附录 D：总进度勾选（复制到笔记里跟踪）

**阶段一 测试**

- [ ] 1.1 脚手架
- [ ] 1.1.6 createApp 拆分
- [ ] 1.2 auth 集成测试
- [ ] 1.3 message 集成测试
- [ ] 1.4 密码策略单测
- [ ] 1.5 CI

**阶段二 Redis**

- [ ] 2.1 redis 模块
- [ ] 2.2 登录限流
- [ ] 2.3 Socket Adapter
- [ ] 2.4 compose redis

**阶段三 安全**

- [ ] 3.1 helmet
- [ ] 3.2 全局限流
- [ ] 3.3 CORS 文档

**阶段四 可观测**

- [ ] 4.1 Pino
- [ ] 4.2 health

**阶段五 队列**

- [ ] 5.1～5.4 预览 BullMQ

**阶段六 Docker**

- [ ] 6.1～6.3

**阶段七～八（可选）**

- [ ] 7 存储抽象
- [ ] 8 压测

---

## 附录 E：卡住时常见原因

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 测试端口占用 | import `app.ts` 会 listen | 做 1.1.6 createApp |
| Prisma 测试脏数据 | 没清理 test_ 用户 | beforeEach cleanup |
| CI MySQL 连不上 | services 主机名应用 `127.0.0.1` | 对照 workflow 示例 |
| Redis 限流不生效 | 用了 memory store 且只开一个进程 | 确认 `REDIS_URL` 与 rate-limit-redis |
| 预览 worker 不消费 | 没起 worker 进程 | `pnpm worker:preview` |
| Docker 迁移失败 | DB 未 ready | depends_on + healthcheck |

---

**下一步建议**：打开 `file_management_backend`，从 **任务 1.1.1** 开始；做完后把附录 D 里第一项勾上。需要我直接在仓库里实现阶段一时，说一声「从 1.1 开始帮我写」即可。
