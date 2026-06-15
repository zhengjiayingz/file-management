# Node 后端补强 — 各阶段痛点、实现与收益

> **用途**：每开一个阶段前读「做之前有什么痛点」；做完后对照「收益」验收，并用于面试口述。  
> **对照**：[NODE_BACKEND_实施任务清单.md](./NODE_BACKEND_实施任务清单.md)（具体改哪些文件）、[NODE_BACKEND_STRENGTHENING.md](./NODE_BACKEND_STRENGTHENING.md)（总纲）。  
> **更新**：2026-06-07

---

## 总览

| 阶段 | 主题 | 必做/可选 | 当前状态 |
|------|------|-----------|----------|
| 一 | 测试 + CI | 必做 | ✅ 已完成 |
| 二 | Redis + 限流 + Socket 多实例 | 必做 | ✅ 已完成 |
| 三 | 安全中间件 | 必做 | ✅ 已完成 |
| 四 | Pino 日志 + 健康检查 | 必做 | ✅ 已完成 |
| 五 | BullMQ 预览队列 + 快览→全文缓存（5.5） | 必做 | ⏳ 待做 |
| 六 | Docker 一键部署 | 必做 | ⏳ 待做 |
| 七 | 对象存储抽象 | 可选 | ⏳ 待做 |
| 八 | 压测与性能笔记 | 可选 | ⏳ 待做 |

阶段之间是递进关系：二的 Redis 为五的队列打基础；五的 Worker 为六的 compose 多容器打基础；六稳定后再做七（OSS）更省事。

---

## 阶段一：测试 + CI

### 做之前有什么痛点

| 痛点 | 具体表现 |
|------|----------|
| **改代码心里没底** | 动登录、消息、上传逻辑后，只能手动 Postman 点一遍，漏测、重复劳动 |
| **测试即启动服务** | `app.ts` 一 import 就 `listen(3000)`，跑测试占端口、和 dev 冲突 |
| **没有回归网** | push 代码不知道有没有弄坏接口，面试官问「你怎么保证质量」答不上来 |
| **测试库与生产混用风险** | 没有 `.env.test`，集成测试可能误删生产数据 |

### 主要实现方式

| 项 | 做法 |
|----|------|
| 测试框架 | Vitest + Supertest |
| 入口拆分 | `createApp.ts` 只组装 Express；`app.ts` 负责 listen / Socket / 定时任务 |
| 集成测试 | `auth.integration.test.ts`、`message.integration.test.ts` 等，用 `test_` 前缀用户 + `beforeEach` 清理 |
| 测试环境 | `test/setup.ts` 加载 `.env.test`，`NODE_ENV=test` |
| CI | `.github/workflows/backend-ci.yml`：MySQL service + `prisma migrate deploy` + `pnpm test` |

**关键文件**：`src/createApp.ts`、`test/*.test.ts`、`vitest.config.ts`、`.github/workflows/backend-ci.yml`

### 做完之后的收益

| 维度 | 变化 |
|------|------|
| **开发效率** | `pnpm test` 一条命令覆盖核心接口，改完即验 |
| **协作/CI** | push 后 GitHub 绿勾，PR 有客观门槛 |
| **架构** | `createApp` 拆分是后续所有阶段写测试的前提 |
| **面试** | 能讲 Vitest/Supertest、集成测试 vs 单测、测试库隔离 |

**验收口诀**：`pnpm test` 稳定绿；跑测试时不应占用 3000 端口。

---

## 阶段二：Redis + 登录限流 + Socket 多实例

### 做之前有什么痛点

| 痛点 | 具体表现 |
|------|----------|
| **登录可被暴力尝试** | 同一 IP 无限次试密码，无 429 |
| **多实例限流失效** | 若用内存限流，开两个 Node 进程，每进程各算 10 次，等于放大限额 |
| **Socket 只能单进程** | `io.to(room).emit` 只在本机内存；用户连实例 B，实例 A 发的消息收不到 |
| **Redis 无统一入口** | 限流、Socket、后续队列各自连 Redis，难维护 |
| **本地缺 Redis 环境** | 同事 clone 后不知道 Redis 怎么起 |

### 主要实现方式

| 项 | 做法 |
|----|------|
| Redis 模块 | `src/lib/redis.ts`：`connectRedis()` / `getRedis()` / `disconnectRedis()` |
| 登录限流 | `express-rate-limit` + `rate-limit-redis`，仅 `POST /api/auth/login`，15 分钟 10 次 |
| 无 Redis 降级 | store 为 undefined 时用内存 store，并 `logger.warn` |
| Socket 多实例 | `@socket.io/redis-adapter`，pub 用主连接，sub 用 `duplicate()` |
| 本地 Redis | `docker-compose.dev.yml` 仅 redis 服务 |

**关键文件**：`src/lib/redis.ts`、`src/middleware/rateLimit.middleware.ts`、`src/realtime/socket.ts`、`docker-compose.dev.yml`

### 做完之后的收益

| 维度 | 变化 |
|------|------|
| **安全** | 同一 IP 连续错登 → 429，防暴力破解 |
| **水平扩展** | 多开 API 进程，登录限流仍全集群累计 |
| **实时消息** | 任意实例 `emitToUser`，连在其它实例的客户端也能收到 |
| **后续阶段** | Redis 基础设施就绪，阶段五 BullMQ 直接复用 |
| **面试** | 能画 Pub/Sub 流程、解释 duplicate 原因、Redis 在限流里的作用 |

**验收口诀**：错登 11 次 → 429；双端口双实例 Socket 互通（见 `notes/SOCKET_MULTI_INSTANCE.md`）。

---

## 阶段三：安全中间件

### 做之前有什么痛点

| 痛点 | 具体表现 |
|------|----------|
| **缺基础 HTTP 安全头** | 无 `X-Content-Type-Options` 等，MIME 嗅探等风险（见 `notes/MIME_SNIFFING.md`） |
| **接口可被无脑刷** | 除登录外，其它 `/api/*` 无全局限流，脚本可狂打列表/搜索 |
| **生产 CORS 易配错** | `credentials: true` 时不能 `*`，文档不清容易线上跨域失败 |
| **安全评审说不清** | 被问「上线前做了什么安全加固」没有清单 |

### 主要实现方式

| 项 | 做法 |
|----|------|
| Helmet | `createApp.ts` 挂 `helmet()`（本项目为全环境开启，比清单更严） |
| API 全局限流 | `getApiRateLimiter()` 挂在 `/api`，默认 300 次/分钟/IP |
| 白名单 | `/health`、`/api-docs` 不在 `/api` 下，自然不受 API 限流 |
| 启动时初始化 | `initRateLimiters()` 在挂路由前调用，避免 express-rate-limit v8 懒创建报错 |
| 文档 | `README.md` 生产部署、`notes/HELMET.md`、`.env.example` CORS 注释 |

**关键文件**：`src/createApp.ts`、`src/middleware/rateLimit.middleware.ts`、`README.md`

### 做完之后的收益

| 维度 | 变化 |
|------|------|
| **响应头** | 常见安全头齐全，降低一类 Web 基础攻击面 |
| **可用性** | 全站 API 有温和限流，单 IP 难以拖垮服务 |
| **部署** | CORS 有文档可依，生产配置不易踩坑 |
| **面试** | 能讲 Helmet 各头含义、CORS + credentials、限流窗口与 store |

**验收口诀**：响应含 `X-Content-Type-Options`；同一接口 1 分钟超 300 次 → 429。

---

## 阶段四：Pino 日志 + 健康检查

### 做之前有什么痛点

| 痛点 | 具体表现 |
|------|----------|
| **日志难查** | `console.log` 纯文本，无 reqId，一条请求的多条日志串不起来 |
| **生产不可控** | 无法按级别过滤，线上日志量难管 |
| **假健康检查** | `GET /health` 永远 200，LB 无法摘掉 MySQL/Redis 挂了的节点 |
| **Redis 硬依赖崩溃** | 配了 `REDIS_URL` 但 Redis 未起 → 进程启动即退出 |
| **env 加载顺序** | ESM import 先于 `dotenv`，logger 读错 `NODE_ENV` |

### 主要实现方式

| 项 | 做法 |
|----|------|
| Pino | `src/lib/logger.ts`，开发用 `pino-pretty` 同步流 |
| HTTP 日志 | `pino-http`：reqId、method、url、statusCode、responseTimeMs |
| 日志精简 | 忽略 OPTIONS、`/health`、`/api-docs`；serializers 不打印完整 headers |
| 基础设施日志 | `cleanup.job`、`socket`、`redis`、`rateLimit`、`app` 启动、Swagger 改用 `logger` |
| 错误中间件 | `req.log?.error({ err }, ...)` |
| 健康检查 | `src/lib/healthCheck.ts`：MySQL `SELECT 1`、Redis `ping` / `skipped` |
| 弹性 Redis | `connectRedis()` 失败 → warn + 降级启动，`/health` 返回 503 |
| 环境加载 | `src/loadEnv.ts` 在 logger 之前加载；`NODE_ENV=test` 时不覆盖 `.env.test` |

**关键文件**：`src/lib/logger.ts`、`src/loadEnv.ts`、`src/lib/healthCheck.ts`、`src/createApp.ts`

### 做完之后的收益

| 维度 | 变化 |
|------|------|
| **排障** | 每条 API 有 reqId + 耗时，grep/日志平台可检索 |
| **探活** | LB 可根据 `/health` 200/503 摘流量 |
| **可用性** | Redis 挂了 API 仍能起，核心 MySQL 业务可用，health 如实报 degraded |
| **面试** | 结构化日志、健康检查 vs 监控、503 语义、graceful degradation |

**验收口诀**：打 API 见 reqId；停 Redis → 服务能起且 `/health` 503；Docker 正常时 `/health` 200。

---

## 阶段五：BullMQ 预览队列

### 做之前有什么痛点

| 痛点 | 具体表现 |
|------|----------|
| **内存队列重启即失** | `preview.service.ts` 里 `conversionQueue[]`，热重载/部署后后台「全文转 PDF」任务消失 |
| **转码与 API 同进程** | LibreOffice 子进程吃 CPU/内存，大 PPT 转换拖慢同进程的 HTTP/Socket |
| **多实例重复劳动** | 两个 API 各有一条内存队列，同 fileHash 可能转两次 |
| **失败难恢复** | 无统一重试、无 waiting/active/failed 状态 |
| **Redis 能力未复用到重任务** | 阶段二上了 Redis，预览却仍用数组队列，架构不统一 |

### 主要实现方式

| 项 | 做法 |
|----|------|
| 队列 | `pnpm add bullmq`，`src/queues/preview.queue.ts`，队列名如 `preview-convert` |
| Worker | `src/workers/preview.worker.ts`，把 `processQueue` 里调 LibreOffice 的逻辑迁入 |
| 改造 service | 删除 `conversionQueue` / `isConverting`；`enqueue` → `queue.add('convert', payload)` |
| 去重 | jobId = `fileHash + op`，同 hash 只入队一次 |
| 重试 | 失败最多 3 次，指数退避 |
| 启动 | 开发 `pnpm dev` 同终端起 API+Worker；**M6** compose 拆为 `api` / `worker` 两容器 |
| 状态 API（推荐） | `GET .../preview-status` 或响应里带 `jobState` |

**关键文件**：`src/queues/preview.queue.ts`、`src/workers/preview.worker.ts`、`src/services/preview.service.ts`

### 做完之后的收益

| 维度 | 变化 |
|------|------|
| **可靠性** | 任务在 Redis，API 重启不丢队 |
| **性能隔离** | Worker 专跑转码，API 专注 HTTP |
| **扩展** | 可单独加 Worker 副本，全集群共用一个队列 |
| **可观测** | job 状态可查、可重试，前端可显示「转换中」 |
| **面试** | HTTP 与长任务分离、为何不用内存队列、BullMQ 与 Redis 关系 |

**验收口诀**：入队后只关 API 留 Worker 仍能转完；API 重启后 waiting job 仍被消费。

### 任务 5.5 补充：快览→全文浏览器缓存

| 痛点 | 具体表现 |
|------|----------|
| **URL 不变 + 304** | 同一 `/preview?token=…` 先返回 25 页快览，浏览器缓存；全文落盘后仍 **304** 或复用旧体，用户以为「永远只有 25 页」 |
| **新标签无 `_t`** | 弹窗 iframe 在 `full` 时会 `iframeCacheBust`，但「新标签打开」无缓存破坏参数 |

| 项 | 做法 |
|----|------|
| 后端 | partial `Cache-Control: no-store`；full 阶段 ETag/304 与 partial 区分 |
| 前端 | 新标签链接带 `_t`；`partial→full` 自动刷新保持 |

**与队列的关系**：阶段五队列保证**磁盘上有 full**；5.5 保证**浏览器显示的是 full**——两件事都要验收。

---

## 阶段六：Docker 一键部署

### 做之前有什么痛点

| 痛点 | 具体表现 |
|------|----------|
| **环境装一堆** | 新机器要装 Node、MySQL、Redis、配 `.env`、跑 migrate，30 分钟～数小时 |
| **「能跑」无法复现** | 面试官 clone 后不知道先起什么、端口冲突、迁移失败 |
| **文档过时** | `PROJECT_STRUCTURE.md` 仍写内存存储、旧 `.js` 结构 |
| **阶段五 Worker 无部署形态** | 只有 `pnpm dev`，生产怎么起 api + worker 说不清 |
| **CI 与运行环境不一致** | 本地能跑，容器里缺依赖（LibreOffice 等） |

### 主要实现方式

| 项 | 做法 |
|----|------|
| Dockerfile | 多阶段：build（`pnpm build`）→  slim 运行镜像（dist + prod deps + prisma） |
| compose | `mysql`、`redis`、`api`、可选 `worker`；卷挂 `uploads` / `previews` |
| 启动顺序 | `depends_on` + MySQL healthcheck；entrypoint：`prisma migrate deploy && node dist/app.js` |
| 预览依赖 | API/Worker 镜像可注明需 LibreOffice 或扩展 worker 镜像 |
| 文档 | `README.md` Docker 章节、环境变量表、FAQ；重写 `PROJECT_STRUCTURE.md` |

**关键文件**：`Dockerfile`、`docker-compose.yml`、`file_management_backend/README.md`

### 做完之后的收益

| 维度 | 变化 |
|------|------|
| **交付** | `docker compose up -d` 10 分钟内 health ok + Swagger 可开 |
| **演示/面试** | 现场 clone → compose → curl `/health`，工程化闭环 |
| **与阶段五衔接** | compose 里 api + worker 两服务，command 不同 |
| **面试** | 多阶段构建、数据卷、无状态 API、migrate 进 entrypoint |

**验收口诀**：新机器只装 Docker → compose up → `curl localhost:3000/health` 200。

---

## 阶段七：对象存储抽象（可选）

### 做之前有什么痛点

| 痛点 | 具体表现 |
|------|----------|
| **存储写死在磁盘** | `uploads/`、`path.join` 散落 controller，换 OSS 要改很多处 |
| **无法水平扩展文件** | 多 API 实例各自本地盘，A 实例上传 B 实例下载不到 |
| **大文件与备份** | 磁盘满、备份迁移都绑在单机 |
| **面试追问 OSS** | 只能说「本地文件夹」，缺抽象层设计 |

### 主要实现方式

| 项 | 做法 |
|----|------|
| 接口 | `src/storage/types.ts`：`put`、`getStream`、`delete`、`exists` |
| 本地实现 | `LocalStorageProvider` 包装现有 `uploads/` 逻辑，行为与改前一致 |
| 云实现 | `OSSStorageProvider` 或 MinIO 骨架，`STORAGE_DRIVER=minio` |
| 接入 | `upload.controller` 等改为 `storage.put(...)`，不散落路径拼接 |
| 本地验证 | MinIO Docker 容器 + 传 1 个小文件 |

**关键文件**：`src/storage/*`、`upload.controller.ts`、`.env.example` 增加 `STORAGE_DRIVER`

### 做完之后的收益

| 维度 | 变化 |
|------|------|
| **架构** | 业务只依赖接口，本地/OSS 可切换 |
| **扩展** | 多实例共享对象存储，无单点磁盘 |
| **产品** | 为 CDN、直传 OSS、冷热分层留口子 |
| **面试** | StorageProvider 模式、大文件直传、本地 vs 云成本 |

**验收口诀**：`STORAGE_DRIVER=local` 行为不变；`minio` 能上传并下载一个小文件。

---

## 阶段八：压测与性能笔记（可选）

### 做之前有什么痛点

| 痛点 | 具体表现 |
|------|----------|
| **性能只有感觉** | 「好像挺快」，没有 p95、QPS 数字 |
| **瓶颈说不清** | 慢在 MySQL、磁盘 IO 还是 LibreOffice 队列，缺少依据 |
| **索引/优化无文档** | 例如消息列表查什么索引，口头说不清 |
| **面试性能题虚** | 被问「登录接口能扛多少」没有脚本和数据 |

### 主要实现方式

| 项 | 做法 |
|----|------|
| 压测脚本 | `scripts/load/login.k6.js`（或 k6）：如 50 VU、30s 打登录或只读接口 |
| 性能笔记 | `docs/PERFORMANCE_NOTES.md`：p95、瓶颈结论、优化建议 |
| 索引建议 | 如 `messages` 的 `(senderId, receiverId, createdAt)` 等 |
| 不追求调优到极致 | 1～2 页 honest 结论即可，够面试用 |

**关键文件**：`scripts/load/login.k6.js`、`docs/PERFORMANCE_NOTES.md`

### 做完之后的收益

| 维度 | 变化 |
|------|------|
| **数据说话** | 「登录 p95 ≈ X ms（50 VU）」有脚本可复现 |
| **优化方向** | 文档写明先优化 DB 还是队列还是磁盘 |
| **面试** | 压测工具、k6 基本用法、性能排查思路 |

**验收口诀**：能跑通 k6 脚本并记录 p95；文档里至少 1 条可执行的索引/瓶颈结论。

---

## 阶段依赖关系（简图）

```text
阶段一 测试/CI
   ↓（createApp 供后续测试）
阶段二 Redis ─────────────────────┐
   ↓                              ↓
阶段三 安全                    阶段五 BullMQ（复用 Redis）
   ↓                              ↓
阶段四 日志/health              阶段六 Docker（api + worker + mysql + redis）
                                     ↓
                              阶段七 OSS（可选）
                                     ↓
                              阶段八 压测笔记（可选）
```

---

## 面试口述模板（每阶段 20 秒）

| 阶段 | 一句话 |
|------|--------|
| 一 | 用 Vitest+Supertest 给登录消息做了集成测试，拆 createApp，CI 自动跑。 |
| 二 | Redis 做登录限流和 Socket 多实例 Adapter，多进程限流和推送仍一致。 |
| 三 | Helmet 安全头 + 全 API 限流 + 生产 CORS 文档。 |
| 四 | Pino 结构化日志带 reqId，health 探 MySQL/Redis，Redis 挂了降级启动。 |
| 五 | Office 预览从内存队列迁 BullMQ，Worker 独立进程，重启不丢任务。 |
| 六 | 多阶段 Dockerfile + compose 一键起 mysql/redis/api/worker。 |
| 七 | StorageProvider 抽象，本地与 MinIO/OSS 可切换。 |
| 八 | k6 压登录拿 p95，文档写瓶颈和索引建议。 |

---

## 相关文档

| 文档 | 说明 |
|------|------|
| [NODE_BACKEND_实施任务清单.md](./NODE_BACKEND_实施任务清单.md) | 逐步勾选的任务 |
| [NODE_BACKEND_STRENGTHENING.md](./NODE_BACKEND_STRENGTHENING.md) | 里程碑与需求 ID |
| [REDIS_INTERVIEW_QA.md](./REDIS_INTERVIEW_QA.md) | Redis 面试 Q&A |
| [notes/SOCKET_MULTI_INSTANCE.md](./notes/SOCKET_MULTI_INSTANCE.md) | Socket 多实例 |
