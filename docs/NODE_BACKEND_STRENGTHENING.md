# Node 后端岗位补强 — 需求文档

> **文档类型**：工程补强 / 面试作品集  
> **关联项目**：`file_management_backend`（在现有网盘后端上增量建设，**不另起空项目**）  
> **编写目的**：覆盖 Node 中级岗位常见考察点（测试、Redis、安全、部署、队列、可观测），且每条可验收、可写进简历  
> **更新日期**：2026-06-03  
> **前置阅读**：[REQUIREMENTS.md](./REQUIREMENTS.md)、[DEVELOPMENT.md](./DEVELOPMENT.md)  
> **照着做（任务级）**：[NODE_BACKEND_实施任务清单.md](./NODE_BACKEND_实施任务清单.md) — 含每天要改的文件、命令与勾选框

---

## 1. 做什么项目？（选型建议）

### 1.1 推荐方案（首选）：**在现有「文件管理后端」上补强**

| 维度 | 说明 |
|------|------|
| **项目名称（对外）** | 企业级文件网盘 API — 工程化与高可用补强 |
| **代码仓库** | 继续使用 `FileManagement_proj/file_management_backend` |
| **理由** | 你已有鉴权、分片上传、Socket、定时任务、Prisma 事务；面试官更信「在真实业务上补 Redis/测试/Docker」，而不是第二个 Todo |
| **简历一句话** | 在完整网盘后端上补齐自动化测试、Redis 限流与会话扩展、异步预览队列、Docker 交付与结构化日志 |

**不建议**再做一个从零的「博客 / 商城」作为主项目——时间会被业务重复消耗，且难以体现你已有深度。

### 1.2 可选方案（仅当时间充裕）：**附属模块「运维控制台 API」**

在同一 monorepo 下新增极小服务 `ops-sidecar`（Express + 只读指标），用于演示：

- 调用主服务 `/health`、Redis ping、队列堆积长度  
- **不作为主作品集**，仅作「了解多服务」的补充  

**结论：主路径 = 补强现有后端；副路径可选，非必须。**

### 1.3 与现有业务需求的关系

- 本文档 **不替代** [REQUIREMENTS.md](./REQUIREMENTS.md) 中的产品功能。  
- 补强项 **尽量挂在已有能力上**（登录、预览、Socket、分享），避免无关新模块。  
- 完成后在 [PROGRESS_REPORT.md](./PROGRESS_REPORT.md) 或 README 增加「工程化里程碑」一节即可。

---

## 2. 目标与成功标准

### 2.1 总目标

在 **4～6 周**（业余节奏）内，使 `file_management_backend` 达到：

1. **可测试**：CI 中 `pnpm test` 稳定通过，核心 API 有集成测试。  
2. **可部署**：`docker compose up` 能启动 MySQL + Redis + API（+ 可选前端）。  
3. **可扩展**：能说清「多实例 Socket / 预览任务」如何依赖 Redis。  
4. **可运维**：结构化日志、健康检查含依赖状态、基础限流与安全头。  
5. **可面试**：每个里程碑对应 2～3 个标准问答（见 §8）。

### 2.2 验收总览

| 里程碑 | 代号 | 必做 | 验收方式 |
|--------|------|------|----------|
| M1 | 测试与 CI | ★★★★★ | GitHub Actions 绿 + 覆盖率报告（可选） |
| M2 | Redis 基础 | ★★★★★ | compose 含 Redis；登录限流生效 |
| M3 | 安全加固 | ★★★★☆ | helmet + 限流 + 生产 CORS 文档 |
| M4 | 日志与健康检查 | ★★★★☆ | JSON 日志；`/health` 含 DB/Redis |
| M5 | 异步队列 | ★★★★☆ | 预览任务进 Bull；重启不丢队列表述 |
| M6 | Docker 交付 | ★★★★★ | 新人按 README 10 分钟内跑起 |
| M7 | 存储抽象（可选） | ★★★☆☆ | `StorageProvider` 接口 + Local 实现 |
| M8 | 压测与文档（可选） | ★★★☆☆ | k6 脚本 + 瓶颈说明 1 页 |

---

## 3. 范围

### 3.1 纳入范围（In Scope）

- 自动化测试（API 集成 + 少量单测）  
- Redis（限流、Socket.IO Adapter、Bull 队列）  
- 安全中间件（helmet、rate-limit）  
- 结构化日志（推荐 Pino）  
- Docker / docker-compose  
- CI（lint + test + build）  
- 预览转换任务队列化（替代或封装现有内存队列）  
- 健康检查增强、部署 README  
- 更新 `PROJECT_STRUCTURE.md`（与 Prisma/TS 现状一致）

### 3.2 不纳入范围（Out of Scope）

- 用 NestJS **重写**整个后端  
- Kubernetes 生产级集群、Service Mesh  
- 微服务拆分（用户服务 / 文件服务独立部署）  
- Elasticsearch 全文检索（见 [EXTRA_REQUIREMENTS.md](./EXTRA_REQUIREMENTS.md)，另排期）  
- 全站 Access Token `jti` Redis 黑名单（现有 `session_version` 方案保留，仅文档说明取舍）

---

## 4. 技术栈增量

| 能力 | 推荐依赖 | 备注 |
|------|----------|------|
| 测试 | `vitest` + `supertest` | 与 ESM 兼容好；或 Jest + ts-node |
| Redis 客户端 | `ioredis` | 与 Bull、Socket Adapter 共用 |
| 限流 | `express-rate-limit` + `rate-limit-redis` | 登录接口必做 |
| 安全头 | `helmet` | 生产默认开启 |
| 日志 | `pino` + `pino-http` | 开发可 pretty-print |
| 队列 | `bullmq`（或 `bull`） | 预览转码 Worker |
| Socket 扩展 | `@socket.io/redis-adapter` | 多实例广播 |
| 容器 | `Dockerfile` + `docker-compose.yml` | 多阶段构建减小镜像 |
| CI | GitHub Actions | `pnpm` 缓存 |
| 压测（可选） | `k6` | 脚本放 `scripts/load/` |

环境变量新增（示例）：

```env
REDIS_URL=redis://localhost:6379
RATE_LIMIT_LOGIN_WINDOW_MS=900000
RATE_LIMIT_LOGIN_MAX=10
LOG_LEVEL=info
STORAGE_DRIVER=local
# STORAGE_DRIVER=oss 时扩展 OSS_* 
```

---

## 5. 功能需求（分里程碑）

### M1 — 自动化测试与 CI

#### M1.1 API 集成测试

| ID | 需求描述 | 验收标准 |
|----|----------|----------|
| M1.1.1 | 测试环境使用独立数据库或 `prisma` 测试库；`beforeAll` 迁移，`afterEach` 清理关键表 | 本地 `pnpm test` 可重复执行 3 次无偶发失败 |
| M1.1.2 | **认证**：注册（或种子用户）→ 登录 → 带 Bearer 访问受保护路由 → 401 无 Token | 至少 4 个 `it` |
| M1.1.3 | **Refresh**：用 refresh 换新 access；撤销后 refresh 失败 | 覆盖 `POST /api/auth/refresh` |
| M1.1.4 | **消息**：两用户种子数据 → A 发消息 → B 拉历史含该条 | 覆盖 `POST/GET /api/messages` 核心路径 |
| M1.1.5 | **健康检查**：`GET /health` 返回 200 与 `status: ok` | 1 个 smoke test |
| M1.1.6 | 测试不依赖真实 FFmpeg 转码；预览相关 mock 或跳过 | CI 无 GUI、无 LibreOffice 也能绿 |

#### M1.2 Service 单测

| ID | 需求描述 | 验收标准 |
|----|----------|----------|
| M1.2.1 | `passwordPolicy.service`：给定策略 DTO，断言合法/非法密码 | ≥5 组用例 |
| M1.2.2 | `storagePath.utils` 或文件路径解析：防止路径穿越 | 含 `../` 用例被拒绝 |

#### M1.3 CI 流水线

| ID | 需求描述 | 验收标准 |
|----|----------|----------|
| M1.3.1 | Push/PR 触发：install → `prisma generate` → `tsc --noEmit` 或 `build` → `test` | `.github/workflows/backend-ci.yml` |
| M1.3.2 | `package.json` 的 `test` 脚本改为真实命令，去掉 `echo Error` | `pnpm test` 一条命令 |

**面试考点**：测试金字塔、如何 mock Prisma、如何保证 CI 与本地一致。

---

### M2 — Redis 基础设施

#### M2.1 连接与配置

| ID | 需求描述 | 验收标准 |
|----|----------|----------|
| M2.1.1 | 新增 `src/lib/redis.ts` 单例；启动时连接；优雅关闭断开 | 连接失败时日志明确，开发环境可配置跳过（仅 dev） |
| M2.1.2 | `docker-compose` 增加 `redis:7` 服务 | `REDIS_URL` 注入 API 容器 |

#### M2.2 登录限流

| ID | 需求描述 | 验收标准 |
|----|----------|----------|
| M2.2.1 | `POST /api/auth/login`：每 IP 15 分钟最多 N 次（默认 10，可 env 配置） | 超限返回 429 + 统一 JSON |
| M2.2.2 | 可选：每用户名维度再限流，防撞库 | 文档说明 key 设计：`rl:login:ip:{ip}` |
| M2.2.3 | 使用 Redis store 的 rate-limit，**非**内存（多实例一致） | 开两个 API 实例限流仍生效 |

#### M2.3 Socket.IO 水平扩展（Redis Adapter）

| ID | 需求描述 | 验收标准 |
|----|----------|----------|
| M2.3.1 | `initSocket` 在存在 `REDIS_URL` 时挂载 `createAdapter(pub, sub)` | 两实例：A 实例 `emitToUser`，B 实例连接的客户端能收到 |
| M2.3.2 | README 增加「多实例部署」示意图（文字即可） | 面试能画：用户连实例 2，消息在实例 1 产生 |

**面试考点**：Redis 单线程为何快、限流算法、Pub/Sub 与 Adapter 区别。

---

### M3 — 安全加固

| ID | 需求描述 | 验收标准 |
|----|----------|----------|
| M3.1 | 生产环境启用 `helmet()`（开发可关闭便于调试） | 响应含常见安全头 |
| M3.2 | 全站 API 温和限流：如每 IP 每分钟 300 次（可配置） | 防止粗暴刷接口 |
| M3.3 | CORS：生产仅允许 `CORS_ORIGIN` 列表；开发保留 localhost 规则 | `.env.example` 注释写清 |
| M3.4 | 上传：维持现有类型/大小校验；文档补充「MIME 与扩展名双校验」 | 安全章节更新 |
| M3.5 | 错误响应：生产不返回 `stack`（现有 development 分支保持） | 手动测 500 |

**面试考点**：CSRF 与 JWT、CORS credentials、文件上传漏洞。

---

### M4 — 结构化日志与健康检查

#### M4.1 日志

| ID | 需求描述 | 验收标准 |
|----|----------|----------|
| M4.1.1 | 使用 Pino 替换关键路径 `console.log`（HTTP 请求、错误、定时任务、队列） | 每条请求 log 含 `reqId`、`method`、`url`、`statusCode`、`durationMs` |
| M4.1.2 | 与 `operationLogs` / `loginLogs` **并存**：表=业务审计，Pino=运维 | 文档 1 段说明分工 |
| M4.1.3 | 敏感字段脱敏：密码、Token、refresh 不出现在 info 日志 | Code review 清单 |

#### M4.2 健康检查

| ID | 需求描述 | 验收标准 |
|----|----------|----------|
| M4.2.1 | `GET /health` 扩展：`checks.mysql`、`checks.redis`（及可选 `queue`） | 依赖失败时 503 + `status: degraded` |
| M4.2.2 | 可选 `GET /health/live` 与 `/health/ready` 分离（K8s 风格） | Docker healthcheck 使用 ready |

**面试考点**：日志级别、关联 ID、健康检查与监控区别。

---

### M5 — 异步任务队列（预览转码）

| ID | 需求描述 | 验收标准 |
|----|----------|----------|
| M5.1 | 将 `preview.service.ts` 中内存 `conversionQueue` 迁为 **BullMQ 队列** `preview:convert` | 入队、处理、完成/失败状态可查 |
| M5.2 | 开发：`pnpm dev` 经 `concurrently` 同终端起 API + Worker；可单独 `dev:api` / `worker:preview` | package.json 脚本 |
| M5.2b | 生产（**M6**）：Worker **独立容器/进程**，与 dev 合并启动拆开 | compose `worker` 服务 |
| M5.3 | 任务 payload：`fileId`、`userId`、`jobType`（partial/full） | 失败重试最多 3 次，指数退避 |
| M5.4 | 任务状态 API（可选）：`GET /api/files/:id/preview-job` 返回 pending/active/failed | 前端可轮询；不做 UI 也可仅 Swagger |
| M5.5 | API 进程重启后，Redis 中 pending 任务仍被 Worker 消费 | 面试话术：「内存队列重启即失，Redis 持久任务」 |
| M5.6 | PPT 快览 partial→全文 full 的**浏览器缓存**一致（§2(17-a)） | partial `no-store`；full 不与 partial 共用 304；新标签 `_t`；验收见任务清单 5.5 |

**面试考点**：削峰、幂等、重复消费、长任务与 HTTP 超时分离；partial/full 分阶段响应勿被浏览器缓存钉死在快览。

---

### M6 — Docker 与部署文档

| ID | 需求描述 | 验收标准 |
|----|----------|----------|
| M6.1 | 多阶段 `Dockerfile`：build → 仅 dist + prisma + production deps | 镜像 < 500MB（经验目标） |
| M6.2 | `docker-compose.yml`：`mysql`、`redis`、`api`、**`worker`（独立容器）**；卷挂载 uploads/previews（api 与 worker 共享） | 一键 `docker compose up -d`；从 dev 的 `concurrently` 拆为两服务 |
| M6.3 | 启动顺序：等 MySQL healthy → migrate/deploy → 起 API | entrypoint 脚本或 compose depends_on |
| M6.4 | `file_management_backend/README.md` 增加「Docker 部署」章节 | 含环境变量表、常见问题 |
| M6.5 | 更新 `PROJECT_STRUCTURE.md`：删除「内存存储」等过时描述 | 与当前 TS+Prisma 一致 |

**面试考点**：多阶段构建、容器内 Prisma migrate、数据卷与无状态 API。

---

### M7 — 对象存储抽象（可选，建议 M6 之后）

| ID | 需求描述 | 验收标准 |
|----|----------|----------|
| M7.1 | 定义 `StorageProvider`：`put`、`getStream`、`delete`、`exists` | `src/storage/types.ts` |
| M7.2 | `LocalStorageProvider` 封装现有 `uploads/` 逻辑 | 行为与改前一致 |
| M7.3 | `OSSStorageProvider` 骨架（阿里云或 MinIO 二选一） | 配置 `STORAGE_DRIVER=oss` 可上传小文件 |
| M7.4 | 下载/预览 URL 生成经 Provider，不散落 `path.join` | 至少 1 条集成测试 mock OSS |

**面试考点**：大文件直传 OSS、回调、CDN、本地与云成本。

---

### M8 — 压测与性能说明（可选）

| ID | 需求描述 | 验收标准 |
|----|----------|----------|
| M8.1 | `scripts/load/login.js`：k6 对登录接口 50 VU 30s | 输出 p95 延迟 |
| M8.2 | `docs/PERFORMANCE_NOTES.md` 1～2 页：瓶颈在 DB/磁盘/转码队列 | 含索引建议（如 `messages` 会话查询） |

---

## 6. 目录与文件规划（建议）

```text
file_management_backend/
├── src/
│   ├── lib/redis.ts
│   ├── lib/logger.ts
│   ├── middleware/rateLimit.middleware.ts
│   ├── workers/preview.worker.ts
│   ├── queues/preview.queue.ts
│   └── storage/              # M7
│       ├── types.ts
│       ├── local.provider.ts
│       └── oss.provider.ts
├── tests/
│   ├── setup.ts
│   ├── auth.integration.test.ts
│   └── message.integration.test.ts
├── scripts/load/
│   └── login.k6.js
├── Dockerfile
├── docker-compose.yml
├── .env.example              # 补 REDIS_*、LOG_*
└── .github/workflows/backend-ci.yml
```

---

## 7. 实施排期（建议）

| 周 | 里程碑 | 产出 |
|----|--------|------|
| 1 | M1 | 5+ 集成测试、CI 绿 |
| 2 | M2 + M3 | Redis、限流、helmet、Socket Adapter 本地双实例验证 |
| 3 | M4 + M5 | Pino、健康检查、Bull 预览队列 |
| 4 | M6 | Docker compose + README |
| 5～6 | M7～M8（可选） | OSS 抽象、k6、性能笔记 |

**每周结束**：在本文档 §9 勾选完成项，并准备 1 个面试故事（问题 → 方案 → 结果）。

---

## 8. 面试问答映射（做完要能讲）

| 主题 | 结合本项目的讲法 |
|------|------------------|
| 双 Token | Access 15m + Refresh 表 + `session_version` 踢线 |
| 为何上 Redis | 登录限流多实例一致 + Socket Adapter + Bull 任务 |
| 如何保证质量 | Supertest 覆盖 auth/message + CI |
| 预览为何用队列 | Office→PDF 耗时长，HTTP 不能阻塞，Bull 重试 |
| 如何部署 | docker compose；health 检查 DB/Redis |
| 如何扩展 Socket | Redis Adapter，房间 `user:{id}` 跨节点 |
| 安全 | helmet、限流、CORS、上传校验、生产隐藏 stack |

---

## 9. 完成度勾选（实施时更新）

- [ ] M1 测试与 CI  
- [ ] M2 Redis + 限流 + Socket Adapter  
- [ ] M3 安全加固  
- [ ] M4 日志与健康检查  
- [ ] M5 Bull 预览队列  
- [ ] M6 Docker 与文档同步  
- [ ] M7 存储抽象（可选）  
- [ ] M8 压测与性能笔记（可选）  

---

## 10. 简历项目描述（模板）

> **文件网盘后端（Node.js / Express / TypeScript）**  
> 负责用户鉴权（JWT 双 Token、TOTP、会话版本踢线）、分片上传与去重、Socket.IO 实时消息。补强工程化：Vitest + Supertest 集成测试与 GitHub Actions CI；Redis 实现登录限流与 Socket 多实例广播；BullMQ 异步预览转码；Pino 结构化日志与 Docker Compose 一键部署。

---

## 11. 参考链接（自学）

- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)  
- [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/)  
- [BullMQ Quick Guide](https://docs.bullmq.io/)  
- [OWASP API Security Top 10](https://owasp.org/API-Security/)（面试安全题）

---

**维护**：补强功能合并主分支后，在 [DEVELOPMENT.md](./DEVELOPMENT.md) 增加「测试 / Docker / Redis」启动说明；不必全部写入 [REQUIREMENTS.md](./REQUIREMENTS.md) 产品章节，以免混淆产品需求与工程需求。
