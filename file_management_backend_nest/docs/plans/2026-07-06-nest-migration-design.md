# Express → Nest 迁移设计文档

> **版本**：v2.0（终态归档）  
> **日期**：2026-07-06 起草 · 2026-07-08 迁移收口  
> **状态**：**迁移完成** — S1～S11 全部完成，`dev` 已合并 `main` 并推送远程  
> **关联文档**：[MIGRATION.md](../../MIGRATION.md)（验收清单）、[MIGRATION_PLAN.md](../../MIGRATION_PLAN.md)（端点清单与工期粗估）、[2026-07-08-s11-shutdown-design.md](./2026-07-08-s11-shutdown-design.md)（下线设计）

---

## 1. 背景与目标

### 1.1 项目背景

网盘后端已完成 Express → Nest 迁移。Nest 版（`file_management_backend_nest`，端口 **3000**）为唯一运行后端；Express（`../file_management_backend`）已归档停服。

| 已完成 | 说明 |
|--------|--------|
| 脚手架、Config、Prisma、Health、ValidationPipe | |
| Redis、全局限流、登录限流、Guards、异常 Filter | |
| **S1** Auth 15 端点全量 | |
| **S2** Files 读（列表、下载、回收站、批量等 11 端点） | |
| **S3** AI 流式问答 | |
| **S4** Office 预览 + BullMQ 入队 | |
| **S5** User + UserPreference（6 端点） | |
| **S6** Files 上传（8 端点：分片、秒传、传统上传、建文件夹） | |
| **S7** Tags / Versions / Archive | |
| **S8** Friendship + Message + Share（16 端点） | |
| **S9** Socket Gateway（`message:new`、`friendship:sync`） | |
| **S10** Admin + VIP + Log（18 端点） | |
| **S11** Swagger / 定时清理 / Preview Worker / Express 下线 | |
| Files 标签（5 端点，**已提前迁入**，归入 S7 验收） | |

### 1.2 终局目标 ✅ 已达成

**全量迁入 Nest，下线 Express。** 这不是部分迁移或长期双栈架构：

- 前端统一请求 Nest API（最终端口 **3000**）
- Express 进程与路由停用
- Prisma schema 以 Nest 侧为唯一权威源
- 迁移完成后仅维护一个 Nest 单体应用

### 1.3 本次设计约束（Brainstorming 确认）

| 维度 | 决策 |
|------|------|
| 审查范围 | 整体架构与计划重审 |
| 优先级 | **学习 / 简历价值** — 尽早覆盖 Nest 典型能力（Guards、BullMQ、WebSocket、流式 AI） |
| 投入节奏 | 半职，约 **4h/天** |
| 代码策略 | **边迁边重构** — Controller 薄封装，按职责拆 Service，补全 DTO |
| 测试深度 | **标准** — 每模块迁完写 Supertest e2e，覆盖该模块全部端点，对比 Express 响应 |
| 迁移路线 | **方案三：纵向切片 + 亮点穿插** |
| 安全保障 | **Express 代码冻结** — 迁移期零业务代码变更（S11 后已归档，不再回退） |

> **澄清**：「学习 / 简历价值」指迁移过程的排期与重构策略，不是只迁一部分就停止。双栈运行是迁移期临时手段（约 5～6 周，2026-07-06～07-08），**已于 S11 结束**；终局为 100% Nest，端口 **3000**。

---

## 2. 架构决策

### 2.1 方案选型

在三种路线中选定 **方案三：纵向切片 + 亮点穿插**。

| 方案 | 描述 | 不选原因 |
|------|------|----------|
| 方案一 | 严格依赖序（Auth → User → Files 读 → …） | 亮点模块偏后，前 3～4 周简历故事弱 |
| 方案二 | Auth 后立刻冲 AI + BullMQ + Socket | 强依赖 Files 读 / Message，边重构易返工 |
| **方案三** ⭐ | 依赖合理前提下穿插亮点 | **选定** — 兼顾学习价值与可演示进度 |

### 2.2 双栈期与终态架构

**双栈期（S1～S10，已结束）**：

- `../file_management_backend` **零业务代码变更**（紧急安全漏洞除外）
- Nest 在 **3002** 联调，Express 在 **3000** 兜底；前端通过 `VITE_API_BASE_URL` 切换
- 每模块 e2e 全绿 + 手测通过后才允许灰度切 Nest

**终态（S11 后，当前）**：

- Nest 独占 **3000**；Express **停服归档**（`README.md` 标记 DEPRECATED）
- 前端默认 `VITE_API_BASE_URL=http://localhost:3000`
- Prisma schema 权威：`file_management_backend_nest/prisma/schema.prisma`
- Preview Worker：`pnpm start:worker:dev` 或 Docker `worker` 服务（`node dist/worker.main.js`）

```
┌─────────────┐                    ┌──────────────────────────────┐
│  Vue 前端   │ ─── :3000 ───────► │ Nest API（main.ts）           │
│  :5173      │                    │ HTTP + Socket + Schedule      │
└─────────────┘                    └──────────────┬───────────────┘
                                                  │ BullMQ 入队
                                                  ▼
                                   ┌──────────────────────────────┐
                                   │ Nest Worker（worker.main.ts） │
                                   │ @Processor('preview-convert') │
                                   └──────────────────────────────┘
         ┌────────────────────────┴────────────────────────┐
         │  MySQL · Redis · uploads / previews 目录          │
         └───────────────────────────────────────────────────┘

Express（../file_management_backend）：只读归档，不参与运行
```

### 2.3 分层约定（边迁边重构标准）

| 层 | 职责 | 禁止 |
|----|------|------|
| **Controller** | 路由声明、DTO 校验、Guard/Decorator | 业务逻辑 |
| **Service** | 业务逻辑，按职责拆分 | 直接操作 Response 对象（流式除外） |
| **DTO** | `class-validator` 校验请求体 | — |
| **Module** | 依赖注入边界，导出 Service | 跨模块直接 import 具体实现 |

**重构示例（Auth 模块）**：

```
auth/
  auth.controller.ts       # 路由
  auth.service.ts          # 登录编排
  session.service.ts       # 会话 CRUD、踢设备
  mfa.service.ts           # TOTP 设置/验证
  password.service.ts      # 改密、忘记密码
  dto/
  auth.module.ts
```

**重构示例（Files 模块）**：

```
files/
  controllers/
    files-query.controller.ts
    files-manage.controller.ts
    files-upload.controller.ts
    files-version.controller.ts
    files-archive.controller.ts
    files-tag.controller.ts
  services/
    files-query.service.ts
    files-manage.service.ts
    merge-upload.service.ts
    chunk.service.ts
    preview.service.ts
  storage/                   # StorageModule：local / MinIO
    storage.module.ts
    local.provider.ts
    minio.provider.ts
  dto/
  files.module.ts
```

### 2.4 基础设施决策

| 决策点 | 方案 | 说明 |
|--------|------|------|
| 架构形态 | 单体 Nest Module | 不拆微服务 |
| Prisma schema | **Nest `prisma/` 为权威** | 迁移期变更须向后兼容（只加 nullable 字段，不删列） |
| 预览 Worker | Nest `@nestjs/bullmq` Processor + 独立 `worker.main.ts` | 队列名 `preview-convert` 不变；Docker worker 含 LibreOffice |
| Socket | S9 与 Message 同阶段交付 | `@nestjs/websockets` + Redis Adapter |
| 静态资源 | `UPLOAD_PATH` 指向 uploads 目录 | 本地可与 Express 共用目录；Docker 挂载 `./uploads` |
| 共享代码 | **不建 monorepo 公共包** | Express 下线后可评估是否抽取 |
| 前端 API | `http://localhost:3000`（Nest） | 双栈切换已废弃 |
| CI | GitHub Actions → Nest e2e | `.github/workflows/backend-ci.yml` 触发 `file_management_backend_nest/**` |
| Docker | `Dockerfile` + `docker-compose.yml` | api + worker + redis；`DOCKER_DATABASE_URL` 连宿主机 MySQL |

### 2.5 目标目录结构

```
src/
  main.ts
  app.module.ts
  common/
    decorators/       # @Public, @CurrentUser, @Roles, @SkipMustChangePassword
    filters/          # AllExceptionsFilter
    guards/           # JwtAuthGuard, RolesGuard, MustChangePasswordGuard
    middleware/       # LoginRateLimitMiddleware
    rate-limit/
    password-policy/
  prisma/
  redis/
  health/
  auth/
  user/
  user-preference/
  files/
    controllers/
    services/
    preview/            # BullMQ 入队 + PreviewProcessor + 状态查询
    storage/
    dto/
  ai/
  admin/
  vip/
  share/
  friendship/
  message/
  operation-log/
  realtime/             # Socket Gateway
  jobs/                 # @nestjs/schedule 定时清理
  worker.main.ts        # 独立 Preview Worker 进程（Docker worker 服务）
```

---

## 3. 分阶段执行计划

半职 4h/天，总工期约 **5～6 周**（S1～S10 双栈期，S11 下线 Express）。

每阶段统一流程：**迁端点 → 边迁边重构 → 写 e2e → 前端灰度 → 回退检查点**。

### S1 — Auth 补全（3 天）✅

**目标**：15 个 Auth 端点全部对齐 Express。

| 端点 | 方法 | 状态 |
|------|------|------|
| `/api/auth/login` | POST | ✅ |
| `/api/auth/refresh` | POST | ✅ |
| `/api/auth/logout` | POST | ✅ |
| `/api/auth/register` | POST | ✅ |
| `/api/auth/password-policy` | GET | ✅ |
| `/api/auth/mfa/verify` | POST | ✅ |
| `/api/auth/forgot-password` | POST | ✅ |
| `/api/auth/change-password` | POST | ✅ |
| `/api/auth/mfa/setup/start` | POST | ✅ |
| `/api/auth/mfa/setup/confirm` | POST | ✅ |
| `/api/auth/mfa/setup/cancel` | POST | ✅ |
| `/api/auth/mfa/disable` | POST | ✅ |
| `/api/auth/me` | GET | ✅ |
| `/api/auth/sessions/list` | POST | ✅ |
| `/api/auth/sessions/revoke` | POST | ✅ |

**重构**：拆 `SessionService`、`MfaService`、`PasswordService`；补全 DTO。

**建议顺序**：`register` → `mfa/*` → `sessions/*` → `change-password` → `forgot-password`

**验收**：`test/e2e/auth.e2e-spec.ts` 15 端点全绿；前端登录 / MFA / 会话踢人全流程。

**回退检查点**（双栈期，已失效）：e2e 失败或前端回归异常 → `.env` 改回 Express 3000。

---

### S2 — Files 读（最小集，4 天）✅

**目标**：网盘主路径读操作，**不含上传**。

| 端点 | 方法 | 状态 |
|------|------|------|
| `/api/files` | GET | ✅ |
| `/api/files/:id` | GET | ✅ |
| `/api/files/:id/download` | GET | ✅ |
| `/api/files/:id/thumbnail` | GET | ✅ |
| `/api/files/:id/text-chunk` | GET | ✅ |
| `/api/files/:id` | DELETE | ✅ |
| `/api/files/:id/restore` | POST | ✅ |
| `/api/files/:id/permanent` | DELETE | ✅ |
| `/api/files/batch/*` | POST | ✅ |
| `/api/files/:id/rename` | PUT | ✅ |
| `/api/files/:id/move` | PUT | ✅ |

**重构**：新建 `StorageModule`；拆 `FilesQueryService` + `FilesManageService`；从 Express `query.controller.ts`（1300+ 行）按职责提取。

**验收**：列表、下载、txt 预览、回收站 e2e 对比 Express。

**前端切换**（双栈期）：仅建议文件页联调；未迁上传前不建议整站长期切 Nest 3002。

---

### S3 — AI 流式问答（2 天）✅

| 端点 | 方法 | 状态 |
|------|------|------|
| `/api/files/:id/ai/ask` | POST | ✅ |

**重构**：新建 `AiModule`；`pipeTextStreamToResponse`；`req.on('close')` → `abortSignal`。

**依赖**：S2 最小文件读（`getFileById`、text-chunk）。

**验收**：curl 验证 chunk 连续输出；前端 `TextChunkPreviewDialog` 划词问答正常。

---

### S4 — 预览 + BullMQ 入队（4 天）✅

| 端点 | 方法 | 状态 |
|------|------|------|
| `/api/files/:id/preview` | GET | ✅ |
| `/api/files/:id/preview-state` | GET | ✅ |
| `/api/files/:id/preview-status` | GET | ✅ |

**重构**：`PreviewModule`；`@nestjs/bullmq` 入队；S4～S10 期间 Worker 临时跑 Express，**S11 已迁 Nest Processor**。

**验收**：预览状态轮询 e2e；队列名 `preview-convert` 不变；Office 预览由 Nest Worker 消费。

---

### S5 — User + UserPreference（2 天）✅

| 端点 | 方法 | 状态 |
|------|------|------|
| `/api/user/profile` | GET | ✅ |
| `/api/user/profile` | PUT | ✅ |
| `/api/user/avatar` | POST | ✅ |
| `/api/user/search` | GET | ✅ |
| `/api/user-preferences` | GET | ✅ |
| `/api/user-preferences` | PUT | ✅ |

**重构**：`FileInterceptor` + sharp 头像；新建 `UserPreferenceModule`。

**验收**：头像上传 + profile e2e。

---

### S6 — Files 上传（6 天）✅ ⚠️ 最重阶段

| 端点 | 方法 | 状态 |
|------|------|------|
| `/api/files/check-exists` | POST | ✅ |
| `/api/files/check-name` | POST | ✅ |
| `/api/files/upload-chunk` | POST | ✅ |
| `/api/files/chunks/:fileHash` | GET | ✅ |
| `/api/files/merge-chunks` | POST | ✅ |
| `/api/files/instant-upload` | POST | ✅ |
| `/api/files/upload` | POST | ✅ |
| `/api/files/folder` | POST | ✅ |

**实施文档**：[2026-07-07-s6-upload-design.md](./2026-07-07-s6-upload-design.md)、[2026-07-07-s6-upload-implementation.md](./2026-07-07-s6-upload-implementation.md)

**重构**：拆 `MergeUploadService`、`ChunkService`；从 Express `mergeUpload.service.ts` 按步骤提取。

**验收**：分片 / 秒传 / 合并全链路 e2e。

**回退检查点**（双栈期，已失效）：上传链路失败 → 回 Express 3000。

---

### S7 — Tags + Versions + Archive（3 天）✅

| 子模块 | 来源 | 状态 |
|--------|------|------|
| Tags（5 端点） | `fileTag.controller.ts` | ✅ `files/tag/` |
| Versions（3 端点） | `version.controller.ts` | ✅ `files/version/` |
| Archive（3 端点） | `archiveExtract.controller.ts` | ✅ `files/archive/`（yauzl） |

**实施文档**：[2026-07-07-s7-versions-archive-design.md](./2026-07-07-s7-versions-archive-design.md)

**验收**：各子模块独立 e2e 文件。

---

### S8 — 社交三模块（4 天）✅

| 模块 | 端点数 | Nest 路径 |
|------|--------|-----------|
| Friendship | 6 | `src/friendship/` |
| Message | 4 | `src/message/` |
| Share | 6 | `src/share/`（公开 3 端点 `@Public()`） |

**实施文档**：[2026-07-07-s8-social-design.md](./2026-07-07-s8-social-design.md)

**验收**：Share 公开链接 e2e；Message / Friendship Socket 推送见 S9 ✅。

---

### S9 — Socket Gateway（3 天）✅

**来源**：Express `src/realtime/socket.ts`

- `ContactsGateway` + Redis Adapter（多实例）
- 握手校验 JWT + `sessionVersion` + `mustChangePassword`
- `RealtimeEmitterService`：`message:new`、`friendship:sync`
- Message / Friendship Service 注入推送

**实施文档**：[2026-07-07-s9-socket-design.md](./2026-07-07-s9-socket-design.md)、[2026-07-07-s9-socket-implementation.md](./2026-07-07-s9-socket-implementation.md)

**验收**：`test/e2e/socket.e2e-spec.ts`（5 用例）+ 双账号手测实时消息。

---

### S10 — Admin + VIP + Log（3 天）✅

| 模块 | 端点数 | 备注 |
|------|--------|------|
| Admin | 9 | `@Roles('admin')` |
| VIP | 8 | 申请审核 + Socket 通知 |
| Log | 1 | 操作日志查询 |

**实施文档**：[2026-07-07-s10-admin-vip-log-design.md](./2026-07-07-s10-admin-vip-log-design.md)

**验收**：`admin.e2e-spec.ts`、`vip.e2e-spec.ts`、`log.e2e-spec.ts` + 管理后台手测。

---

### S11 — 收尾与 Express 下线（3 天）✅

| 任务 | 说明 | 状态 |
|------|------|------|
| Swagger | `@nestjs/swagger`，路径 `/api-docs` | ✅ |
| 定时清理 | `@nestjs/schedule` 迁 `cleanup.job.ts`（`CleanupTasksService`） | ✅ |
| Worker 迁移 | Express `preview.worker.ts` → Nest `PreviewProcessor` + `worker.main.ts` | ✅ |
| e2e 回归 | 全模块 e2e 绿灯 + `teardown-e2e` 自动清理 | ✅ |
| 端口切换 | Nest → **3000**，Express **停服归档** | ✅ |
| docker-compose | `Dockerfile` + `api` / `worker` / `redis` 三服务 | ✅ |
| Docker 构建修复 | 镜像内 `node-linker=hoisted` + `.dockerignore` | ✅ |
| GitHub CI | `backend-ci.yml` 切 Nest `pnpm test:e2e` | ✅ |
| Prisma 权威 | Nest `prisma/schema.prisma` 为唯一维护点 | ✅ |
| 文档 | `MIGRATION.md` 完成态；Express `README` DEPRECATED | ✅ |
| Git | `dev` 合并 `main` 并推送远程（`518df53`） | ✅ |

**此阶段后**：双栈期结束，仅运行 Nest（API + Worker）。

**实施文档**：[2026-07-08-s11-shutdown-design.md](./2026-07-08-s11-shutdown-design.md)、[2026-07-08-s11-shutdown-implementation.md](./2026-07-08-s11-shutdown-implementation.md)

**验收**：`swagger.e2e-spec.ts` + `cleanup-tasks.service.spec.ts` + `pnpm test:e2e` 21 suites 全绿；Docker compose 手测（`/health`、`/api-docs`、Office 预览 Worker）通过 ✅

---

### 阶段依赖图

```
S1 Auth ✅ ──► S2 Files读 ✅ ──► S3 AI ✅
                    │
                    ├──► S4 预览+BullMQ ✅
                    │
                    ├──► S6 上传 ✅ ──► S7 Tags/Versions/Archive ✅
                    │
S5 User ✅ ◄──（已与 S3/S4 并行完成）

S8 社交 ✅ ──► S9 Socket ✅ ──► S10 Admin/VIP/Log ✅ ──► S11 下线 ✅
```

**暂停策略**（双栈期）：任一阶段可暂停；已迁模块留 Nest，未迁走 Express 3000。S11 后不再适用。

---

## 4. 测试策略

### 4.1 原则

- 每模块迁完即写 e2e，**该模块全部端点**覆盖
- 断言 **HTTP status + 关键 JSON 字段** 与 Express 一致
- API 契约不变：路径、请求体、响应 JSON 结构保持与 Express 相同
- 流式端点（AI）额外用 curl 验证 chunk 连续性

### 4.2 目录约定

```
test/
  jest-e2e.json
  helpers/
    app-bootstrap.ts       # 统一 Nest 应用初始化（对齐 main.ts 配置）
    auth.helper.ts         # 获取测试用 Token
    express-baseline.ts    # 可选：对照 Express 响应快照
  e2e/
    health.e2e-spec.ts         # ✅
    auth.e2e-spec.ts           # ✅
    auth-register.e2e-spec.ts  # ✅
    files-query.e2e-spec.ts  # ✅
    files-manage.e2e-spec.ts   # ✅
    files-upload.e2e-spec.ts # ✅ S6
    files-ai.e2e-spec.ts       # ✅
    files-preview.e2e-spec.ts  # ✅
    user.e2e-spec.ts           # ✅
    user-preference.e2e-spec.ts # ✅
    files-tag.e2e-spec.ts      # ✅ S7
    files-version.e2e-spec.ts  # ✅ S7
    files-archive.e2e-spec.ts  # ✅ S7
    friendship.e2e-spec.ts     # ✅ S8
    message.e2e-spec.ts        # ✅ S8
    share.e2e-spec.ts          # ✅ S8
    socket.e2e-spec.ts         # ✅ S9
    admin.e2e-spec.ts          # ✅ S10
    vip.e2e-spec.ts            # ✅ S10
    log.e2e-spec.ts            # ✅ S10
    swagger.e2e-spec.ts        # ✅ S11
```

**合计**：21 suites；`pnpm test:e2e` 结束后 `teardown-e2e` 自动清理测试数据。

### 4.3 e2e 脚手架

`test/helpers/app-bootstrap.ts` 须复现 `main.ts` 关键配置：

```typescript
// 对齐生产 bootstrap
app.setGlobalPrefix('api', { exclude: ['health'] });
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
app.useGlobalFilters(new AllExceptionsFilter());
// Guards 通过 AppModule 全局注册，e2e 无需重复
```

### 4.4 对比 Express 的做法

每个 e2e 用例结构：

```typescript
describe('POST /api/auth/login', () => {
  it('应与 Express 行为一致', async () => {
    const body = { username: 'test', password: 'Test@1234' };

    const nestRes = await request(nestApp.getHttpServer())
      .post('/api/auth/login')
      .send(body);

    // 关键字段对比（不要求字节级相同，如 timestamp 可忽略）
    expect(nestRes.status).toBe(200);
    expect(nestRes.body.success).toBe(true);
    expect(nestRes.body.data).toHaveProperty('accessToken');
  });
});
```

### 4.5 特殊场景测试

| 场景 | 验证方式 |
|------|----------|
| 全局限流 429 | 脚本连打 301 次 |
| 登录限流 | POST login 连打 11 次 / 15min |
| 强制改密 403 | 临时密码用户调非白名单 API |
| MFA 流程 | login → mfa/verify 两步 |
| 会话上限 409 | 双设备登录 + revoke |
| AI 流式 | curl `-N` 验证 chunk |
| 预览队列 | 入队后 preview-state 轮询至 done |
| Socket 握手 | 无 Token / 过期 Token 拒绝 |

### 4.6 阶段门禁（归档）

| 门禁 | 条件 | 当前 |
|------|------|------|
| 模块完成 | 该模块 e2e 全绿 | ✅ 全部通过 |
| 允许前端切 Nest（双栈期） | 已迁模块 e2e 全绿 + 主流程手测 | ✅ 已于 S11 统一切 3000 |
| 允许 S11 下线 | 全模块 e2e 全绿 + docker-compose 验证 | ✅ 已完成 |

---

## 5. 错误处理与 API 契约

### 5.1 异常格式

沿用 Express `error.middleware.ts` 响应格式，通过 `AllExceptionsFilter` 统一：

```json
{
  "success": false,
  "code": "RATE_LIMIT",
  "message": "请求过于频繁，请稍后再试"
}
```

Nest 业务异常使用 `@nestjs/common` 内置异常 + 自定义 `code` 字段（与 Express 错误码对齐）。

### 5.2 关键错误码对照

| 场景 | HTTP | code |
|------|------|------|
| 未认证 | 401 | — |
| 权限不足 | 403 | — |
| 强制改密 | 403 | `MUST_CHANGE_PASSWORD` |
| 会话上限 | 409 | `SESSION_LIMIT` |
| 限流 | 429 | `RATE_LIMIT` |
| MFA 待验证 | 200 | `MFA_REQUIRED` |

### 5.3 流式响应

AI 端点不使用标准 JSON 包装，直接 `text/plain` 或 `text/event-stream` 流式输出，与 Express 保持一致。

---

## 6. 数据流

### 6.1 请求链路

```
Client → CORS/Helmet → RateLimit(/api) → JwtAuthGuard → MustChangePasswordGuard
       → RolesGuard(若 @Roles) → Controller → Service → Prisma/Redis/Storage
       → AllExceptionsFilter → JSON Response
```

### 6.2 共享基础设施（终态）

| 资源 | 共用方式 | 说明 |
|------|----------|------|
| MySQL | 同一 `DATABASE_URL` | Docker 容器用 `DOCKER_DATABASE_URL`（`host.docker.internal`） |
| Redis | 本地 dev 用 `127.0.0.1:6379`；Docker compose 内网 `redis:6379` | compose Redis 不映射宿主机 6379，避免与 `file_mgmt_redis_dev` 冲突 |
| MinIO / local storage | `UPLOAD_PATH` / `./uploads` 卷挂载 | Docker 与本地可共用宿主机目录 |
| BullMQ | 队列名 `preview-convert` | Nest `PreviewProcessor` 消费 |
| JWT | 同一 `JWT_SECRET` | 前后端、多进程共享 |

### 6.3 Prisma schema 变更规则

迁移完成后：

1. 只在 Nest `prisma/schema.prisma` 修改
2. 生产变更走 `prisma migrate`；本地 dev 可用 `prisma db push`
3. `pnpm prisma:generate` 后跑 e2e 验证
4. Express 侧 schema **不再维护**（只读归档）

---

## 7. 风险与应对（归档）

| 风险 | 应对 | 终态 |
|------|------|------|
| Files 上传/预览代码量大 | Service 按职责拆分 | ✅ 已拆分 |
| 两套路由漂移 | e2e 对比 + 端点 checklist | ✅ Express 已下线 |
| Prisma schema 双份历史 | Nest 权威 | ✅ 已统一 |
| Socket 与 REST 不同步 | S8 + S9 绑定交付 | ✅ |
| Worker 依赖 LibreOffice | Docker worker 镜像安装 LO | ✅ |
| Docker pnpm 构建失败 | 镜像内 `node-linker=hoisted` | ✅ `518df53` |
| 边迁边重构引入回归 | 每阶段 e2e 门禁 | ✅ 21 suites 全绿 |
| Nest 出严重 bug（双栈期） | 切回 Express 3000 | ⛔ 双栈已结束，不再回退 |

---

## 8. 本地开发与部署

### 8.1 日常开发（推荐）

```bash
cd file_management_backend_nest
cp .env.example .env    # DATABASE_URL、JWT_SECRET、REDIS_URL
pnpm install
pnpm prisma:generate
pnpm start:dev          # API http://localhost:3000
pnpm start:worker:dev   # Preview Worker（另开终端，需 LibreOffice）
```

前端（另开终端）：

```bash
cd ../file_management_frontend
npm run dev             # http://localhost:5173
# .env: VITE_API_BASE_URL=http://localhost:3000
```

Swagger：`http://localhost:3000/api-docs`  
Health：`http://localhost:3000/health`

### 8.2 Docker Compose

```bash
cd file_management_backend_nest
# .env 需配置 DOCKER_DATABASE_URL=mysql://...@host.docker.internal:3306/...
docker compose up -d --build
docker compose ps       # api + worker + redis 均 Up
```

注意：Docker 与本地 `pnpm start:dev` **不可同时占 3000**；compose Redis 不映射宿主机 6379。

### 8.3 Express 归档

`../file_management_backend` 保留只读参照，**不再启动**。详见其 `README.md` DEPRECATED 说明。

---

## 9. 端点进度总览

> 最后更新：2026-07-08（S11 完成，`main` 已合并）

| 模块 | 进度 | 阶段 | 状态 |
|------|------|------|------|
| Auth | 15/15 | S1 | ✅ |
| User | 4/4 | S5 | ✅ |
| UserPreference | 2/2 | S5 | ✅ |
| Files 读 | 11/11 | S2 | ✅ |
| AI | 1/1 | S3 | ✅ |
| Preview | 3/3 | S4 | ✅ |
| Files 上传 | 8/8 | S6 | ✅ |
| Tags | 5/5 | S7 | ✅ |
| Versions | 3/3 | S7 | ✅ |
| Archive | 3/3 | S7 | ✅ |
| Friendship | 6/6 | S8 | ✅ |
| Message | 4/4 | S8 | ✅ |
| Share | 6/6 | S8 | ✅ |
| Socket | 1/1 | S9 | ✅ |
| Admin | 9/9 | S10 | ✅ |
| VIP | 8/8 | S10 | ✅ |
| Log | 1/1 | S10 | ✅ |
| Swagger | `/api-docs` | S11 | ✅ |
| Cleanup Cron | 每小时 | S11 | ✅ |
| Preview Worker | `preview-convert` | S11 | ✅ |

**已迁 REST 端点合计**：约 **94/94**。  
**当前 e2e**：**21 suites** 全绿（`pnpm test:e2e`）。  
**Git**：`main` @ `518df53`（含 Docker 构建修复）。

Express 已下线，双栈期结束。

---

## 10. 迁移后路线图

迁移（S1～S11）已告一段落。后续按 AI 能力规划推进：

| 阶段 | 内容 | 文档 |
|------|------|------|
| **S12** | 单文件索引 + RAG（TXT/MD） | [2026-07-09-s12-ai-index-rag-implementation.md](./2026-07-09-s12-ai-index-rag-implementation.md) |
| S13 | 分层摘要 Map-Reduce | [2026-07-08-ai-capability-roadmap-design.md](./2026-07-08-ai-capability-roadmap-design.md) |
| S14 | 学术论文 structured knowledge | 同上 |
| S16 | 多文件知识库 RAG | 同上 |

功能全景与优先级：[2026-07-08-ai-features-prd.md](./2026-07-08-ai-features-prd.md)

运维向（非阻塞）：生产监控、性能优化、Swagger DTO 注解补全。

---

*本文档由 superpowers brainstorming 流程产出；v2.0 归档 S1～S11 完成态与终态架构（2026-07-08）。*
