# 网盘后端 Express → Nest 迁移计划书

> 本文档供评审与排期使用。终局目标：**全量迁入 Nest，下线 Express**。  
> 源项目：`../file_management_backend`（Express，端口 3000）  
> 目标项目：`file_management_backend_nest`（Nest，迁移期端口 **3002**）

---

## 1. 迁移目标与原则

### 1.1 终局

- 前端统一请求 Nest API（最终端口改回 **3000**）
- Express 进程与路由下线
- Prisma schema 以 Nest 侧为唯一权威源

### 1.2 原则

| # | 原则 | 说明 |
|---|------|------|
| 1 | 纵向切片 | 按业务域（Auth、Files…）逐模块迁移，每阶段可独立验收 |
| 2 | 共用基础设施 | 同一 MySQL、Redis、MinIO、BullMQ 队列名，避免双写 |
| 3 | API 契约不变 | 路径、请求体、响应 JSON 与 Express 保持一致 |
| 4 | 先 Service 后外壳 | 业务逻辑从 Express Controller/Service 搬到 Nest Service，Controller 做薄封装 |
| 5 | Worker 可后置 | 预览 Worker 初期继续跑 Express 版 `preview.worker.ts` |

### 1.3 迁移期双栈

```
Vue 前端
  ├─ 已迁模块 → http://localhost:3002/api/...
  └─ 未迁模块 → http://localhost:3000/api/...
```

全部迁完后：Nest 独占 3000，Express 停用。

---

## 2. 现状盘点

### 2.1 Express 模块规模（约 94 个 REST 端点）

| 域 | 路由文件 | 端点数 | 复杂度 | 核心代码 |
|----|----------|--------|--------|----------|
| Auth | `src/routes/auth.routes.ts` | 15 | M | `src/controllers/auth.controller.ts` |
| Files | `src/routes/file.routes.ts` | 39 | **XL** | `src/controllers/file/*.ts`（6 个子 controller） |
| Admin | `src/routes/admin.routes.ts` | 9 | M | `src/controllers/admin.controller.ts` |
| VIP | `src/routes/vip.routes.ts` | 8 | M | `src/controllers/vip.controller.ts` |
| Share | `src/routes/share.routes.ts` | 6 | M | `src/controllers/share.controller.ts` |
| Friendship | `src/routes/friendship.routes.ts` | 6 | S | `src/controllers/friendship.controller.ts` |
| Message | `src/routes/message.routes.ts` | 4 | M | `src/controllers/message.controller.ts` |
| User | `src/routes/user.routes.ts` | 4 | S | `src/controllers/user.controller.ts` |
| UserPreference | `src/routes/user-preference.routes.ts` | 2 | S | `src/controllers/user-preference.controller.ts` |
| Log | `src/routes/log.routes.ts` | 1 | S | `src/controllers/log.controller.ts` |

另有：**Socket.IO**（`src/realtime/socket.ts`）、**预览 Worker**（`src/workers/preview.worker.ts`）。

### 2.2 Nest 当前进度（截至文档编写时）

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 | 脚手架、Config、Prisma、Health、ValidationPipe | ✅ 已完成 |
| P1a | 横切：Redis、全局限流、登录限流、MustChangePasswordGuard、RolesGuard、异常 Filter、pino、helmet、静态 `/uploads` | ✅ 已完成 |
| P1b | Auth：`login` / `refresh` / `logout` | ✅ 已完成 |
| P1c | User：`GET /user/profile` | ✅ 已完成 |
| P2 | Auth 剩余 12 端点 | ⬜ 未开始 |
| P3～P12 | 见下文分阶段计划 | ⬜ 未开始 |

### 2.3 Express → Nest 能力对照

| 能力 | Express | Nest 方案 | Nest 状态 |
|------|---------|-----------|-----------|
| 鉴权 | `auth.middleware.ts` | `JwtAuthGuard`（全局） | ✅ |
| 管理员 | `admin.middleware.ts` | `RolesGuard` + `@Roles('admin')` | ✅ Guard 已有，路由未挂 |
| 强制改密 | `mustChangePassword.middleware.ts` | `MustChangePasswordGuard`（全局） | ✅ |
| 全局限流 | `rateLimit.middleware.ts` | `RateLimitService` + Express 中间件 | ✅ |
| 登录限流 | `loginRateLimiter` | `LoginRateLimitMiddleware` | ✅ |
| 全局错误 | `error.middleware.ts` | `AllExceptionsFilter` | ✅ |
| 日志 | pino-http | `nestjs-pino` | ✅ |
| Redis | `lib/redis.ts` | `RedisModule` | ✅ |
| 静态资源 | `/uploads` | `useStaticAssets` | ✅ |
| Swagger | swagger-ui-express | `@nestjs/swagger` | ⬜ |
| BullMQ 入队 | `queues/preview.queue.ts` | `@nestjs/bullmq` | ⬜ |
| Socket | `realtime/socket.ts` | `@nestjs/websockets` Gateway | ⬜ |
| 定时清理 | `jobs/cleanup.job.ts` | `@nestjs/schedule` | ⬜ |

---

## 3. 目标目录结构

```
file_management_backend_nest/src/
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
    controllers/      # query / manage / upload / version / archive / tag
    services/         # mergeUpload, preview, tagLimit, storage
    dto/
  ai/
  admin/
  vip/
  share/
  friendship/
  message/
  log/
  realtime/           # Socket Gateway
```

---

## 4. 分阶段迁移计划

### 阶段 0 — 基础骨架 ✅

**已完成**：Nest 项目、`PrismaModule`、`ConfigModule`、端口 3002、`GET /health`。

**验收**：`pnpm build` 通过。

---

### 阶段 1 — 横切基础设施 ✅

**目标**：Nest 具备与 Express 同等的基础运行时能力。

| 任务 | Express 来源 | Nest 落点 |
|------|-------------|-----------|
| Redis 连接 | `lib/redis.ts` | `src/redis/` |
| 全局限流 300/min | `rateLimit.middleware.ts` | `RateLimitService` + `main.ts` 挂 `/api` |
| 登录限流 10/15min | 同上 | `LoginRateLimitMiddleware` on `POST auth/login` |
| 强制改密 | `mustChangePassword.middleware.ts` | `MustChangePasswordGuard` |
| 管理员鉴权 | `admin.middleware.ts` | `RolesGuard` |
| 统一异常 | `error.middleware.ts` | `AllExceptionsFilter` |
| 日志 | pino-http | `LoggerModule`（nestjs-pino） |
| Helmet + CORS + 静态 | `createApp.ts` | `main.ts` |
| Health Redis 检测 | `healthCheck.ts` | `HealthService` |

**验收**：
- [ ] 超限返回 429 + `RATE_LIMIT`
- [ ] 临时密码用户调非白名单 API 返回 403 + `MUST_CHANGE_PASSWORD`
- [ ] `GET /health` 含 `mysql` / `redis` 状态

---

### 阶段 2 — Auth 模块补全（约 4～5 天）

**目标**：15 个 Auth 端点全部对齐 Express。

| 端点 | 方法 | 状态 | Express 来源 | 备注 |
|------|------|------|-------------|------|
| `/api/auth/login` | POST | ✅ | `login` | 含会话上限 409 |
| `/api/auth/refresh` | POST | ✅ | `refreshToken` | |
| `/api/auth/logout` | POST | ✅ | `logout` | |
| `/api/auth/register` | POST | ⬜ | `register` | 含 `ensureFriendshipWithAdmin` |
| `/api/auth/password-policy` | GET | ⬜ | `getPasswordPolicy` | |
| `/api/auth/mfa/verify` | POST | ⬜ | `verifyMfaLogin` | 依赖 otplib |
| `/api/auth/forgot-password` | POST | ⬜ | `forgotPasswordRequest` | 依赖 Message + Socket emit |
| `/api/auth/change-password` | POST | ⬜ | `changePassword` | 白名单路由 |
| `/api/auth/mfa/setup/start` | POST | ⬜ | `mfaSetupStart` | |
| `/api/auth/mfa/setup/confirm` | POST | ⬜ | `mfaSetupConfirm` | |
| `/api/auth/mfa/setup/cancel` | POST | ⬜ | `mfaSetupCancel` | |
| `/api/auth/mfa/disable` | POST | ⬜ | `mfaDisable` | |
| `/api/auth/me` | GET | ⬜ | `getCurrentUser` | |
| `/api/auth/sessions/list` | POST | ⬜ | `postMySessionsList` | 双 Token 踢设备 |
| `/api/auth/sessions/revoke` | POST | ⬜ | `revokeMySessions` | |

**建议顺序**：`register` → `mfa/*` → `sessions/*` → `change-password` → `forgot-password`

**依赖安装**：`otplib`（已装）

**验收**：前端登录全流程（MFA、会话上限、刷新 Token）切到 3002 无回归。

---

### 阶段 3 — User + UserPreference（约 2 天）

| 端点 | 方法 | 状态 | 说明 |
|------|------|------|------|
| `/api/user/profile` | GET | ✅ | |
| `/api/user/profile` | PUT | ⬜ | `UpdateProfileDto` |
| `/api/user/avatar` | POST | ⬜ | `FileInterceptor` + sharp |
| `/api/user/search` | GET | ⬜ | |
| `/api/user-preferences` | GET | ⬜ | 新建 `UserPreferenceModule` |
| `/api/user-preferences` | PUT | ⬜ | |

---

### 阶段 4 — Files 核心读操作（约 5～7 天）

**不含上传**，网盘主路径。

| 端点 | 方法 | 状态 | Express 来源 |
|------|------|------|-------------|
| `/api/files` | GET | ⬜ | `getFiles` |
| `/api/files/:id` | GET | ⬜ | `getFileById` |
| `/api/files/:id/download` | GET | ⬜ | `downloadFile` |
| `/api/files/:id/thumbnail` | GET | ⬜ | `getFileThumbnail` |
| `/api/files/:id/text-chunk` | GET | ⬜ | `getTextFileChunk` |
| `/api/files/:id` | DELETE | ⬜ | `deleteFile`（软删） |
| `/api/files/:id/restore` | POST | ⬜ | `restoreFile` |
| `/api/files/:id/permanent` | DELETE | ⬜ | `permanentDeleteFile` |
| `/api/files/batch/*` | POST | ⬜ | 批量 delete/restore/move/download-zip |
| `/api/files/:id/rename` | PUT | ⬜ | `renameFile` |
| `/api/files/:id/move` | PUT | ⬜ | `moveFile` |

**依赖**：`storage/` 模块（local/MinIO）、`file.utils`、`fileBatch.utils`

**Nest 模块**：`FilesQueryController` + `FilesManageController` + `FilesService`

**验收**：列表、txt 预览、下载、回收站在 Nest 跑通。

---

### 阶段 5 — AI 流式问答（约 2～3 天）

| 端点 | 方法 | 状态 | 说明 |
|------|------|------|------|
| `/api/files/:id/ai/ask` | POST | ⬜ | `streamText` + 流式 Response |

**依赖**：`ai`、`@ai-sdk/openai`（从 Express 复制 `ai.service.ts` 逻辑）

**Nest 要点**：
- `@Res({ passthrough: false })` 或 `pipeTextStreamToResponse`
- `req.on('close')` → `abortSignal`

**验收**：`TextChunkPreviewDialog` 划词问答流式打字机正常。

---

### 阶段 6 — Office 预览 + BullMQ（约 5～7 天）

| 端点 | 方法 | 状态 | 说明 |
|------|------|------|------|
| `/api/files/:id/preview` | GET | ⬜ | PDF 预览 |
| `/api/files/:id/preview-state` | GET | ⬜ | 转码状态轮询 |
| `/api/files/:id/preview-status` | GET | ⬜ | 同上别名 |

**策略**：
- Nest：`@nestjs/bullmq` 入队 + 查状态
- Worker：**继续复用** Express `preview.worker.ts`（队列名 `preview-convert` 不变）

**依赖**：`preview.service.ts`（约 680 行）、LibreOffice

---

### 阶段 7 — Files 上传（约 7～10 天，最难）

| 端点 | 方法 | 状态 | 说明 |
|------|------|------|------|
| `/api/files/check-exists` | POST | ⬜ | |
| `/api/files/check-name` | POST | ⬜ | |
| `/api/files/upload-chunk` | POST | ⬜ | 分片 |
| `/api/files/chunks/:fileHash` | GET | ⬜ | |
| `/api/files/merge-chunks` | POST | ⬜ | |
| `/api/files/instant-upload` | POST | ⬜ | 秒传 |
| `/api/files/upload` | POST | ⬜ | 单文件 |
| `/api/files/folder` | POST | ⬜ | 建文件夹 |

**依赖**：`mergeUpload.service.ts`、multer、`storage/`

**风险**：逻辑最复杂，建议整包搬 Service，Controller 只做 DTO + `FileInterceptor`。

---

### 阶段 8 — Tags + Versions + Archive（约 4～5 天）

| 端点 | 方法 | 状态 | 来源 |
|------|------|------|------|
| `/api/files/tags` | GET/POST | ⬜ | `fileTag.controller.ts` |
| `/api/files/tags/:tagId` | PUT/DELETE | ⬜ | |
| `/api/files/:id/tags` | PUT | ⬜ | |
| `/api/files/:id/versions` | GET | ⬜ | `version.controller.ts` |
| `/api/files/:id/versions/:versionId/rollback` | POST | ⬜ | |
| `/api/files/:id/versions/:versionId/download` | GET | ⬜ | |
| `/api/files/:id/archive/*` | GET/POST | ⬜ | `archiveExtract.controller.ts` |

---

### 阶段 9 — 社交与分享（约 5～7 天）

| 模块 | 端点数 | 状态 | 备注 |
|------|--------|------|------|
| Friendship | 6 | ⬜ | 好友请求/列表 |
| Message | 4 | ⬜ | 与 Socket 联动 |
| Share | 6 | ⬜ | 含公开链接（无需登录） |

---

### 阶段 10 — Socket.IO 实时（约 4～5 天）

**来源**：`src/realtime/socket.ts`

- `MessagesGateway` + Redis Adapter（多实例）
- 握手校验 JWT + `sessionVersion`
- 与 Message REST 同阶段联调

---

### 阶段 11 — Admin + VIP + Log（约 4～5 天）

| 模块 | 端点数 | 状态 | 备注 |
|------|--------|------|------|
| Admin | 9 | ⬜ | `@Roles('admin')` |
| VIP | 8 | ⬜ | 申请审核 |
| Log | 1 | ⬜ | 操作日志 |

---

### 阶段 12 — 收尾与 Express 下线（约 3～5 天）

| 任务 | 说明 |
|------|------|
| Swagger | `@nestjs/swagger` 对齐现有 `/api-docs` |
| 定时清理 | `@nestjs/schedule` 迁 `cleanup.job.ts` |
| e2e 测试 | Supertest 覆盖 auth、files、ai 关键路径 |
| 端口切换 | Nest → 3000，Express 停用 |
| docker-compose | 替换 `api` 服务镜像/启动命令 |
| Prisma 权威 | 只维护 Nest 侧 `prisma/schema.prisma` |
| 文档 | 更新 `MIGRATION.md` 为完成态 |

---

## 5. 推荐执行顺序

兼顾**依赖关系**与**面试价值**：

```
1. 阶段 2  Auth 补全          ← 前端才能完整登录
2. 阶段 5  AI 流式            ← 简历/JD 亮点，工作量小
3. 阶段 4  Files 读           ← 网盘核心
4. 阶段 6  预览 + BullMQ
5. 阶段 3  User + Preference
6. 阶段 7  Files 上传         ← 最难，放后
7. 阶段 8  Tags/Versions/Archive
8. 阶段 9  社交分享
9. 阶段 10 Socket             ← 与 Message 绑定
10. 阶段 11 Admin/VIP/Log
11. 阶段 12 收尾下线
```

---

## 6. 测试策略

| 层级 | 做法 |
|------|------|
| 单接口 | Supertest e2e，对比 Express 的 status + 关键字段 |
| 回归 | 已迁模块：前端主流程手测 |
| 流式 AI | curl 验证 chunk 连续输出 |
| 限流/会话 | 脚本连打 301 次；双设备登录踢人 |
| Prisma | schema 变更后两边同步 `pnpm prisma:generate` |

---

## 7. 风险与应对

| 风险 | 应对 |
|------|------|
| Files 上传/预览代码量大（query.controller 1300+ 行） | Service 原样搬，不重写；Controller 薄封装 |
| 两套路由漂移 | 本文档端点 checklist + `MIGRATION.md` 进度表 |
| Prisma schema 双份 | 阶段 12 前用复制同步；最终以 Nest 为权威 |
| Socket 与 REST 不同步 | Message 与 Gateway 同阶段交付 |
| Worker 依赖 LibreOffice | Worker 最后迁，队列协议不变 |
| 工期过长烂尾 | 每阶段必须有「可演示」验收标准 |

---

## 8. 工期粗估

| 阶段 | 内容 | 预估（业余 2h/天） |
|------|------|-------------------|
| 0～1 | 骨架 + 横切 | ✅ 已完成 |
| 2 | Auth 补全 | 4～5 天 |
| 3 | User + Preference | 2 天 |
| 4 | Files 读 | 5～7 天 |
| 5 | AI 流式 | 2～3 天 |
| 6 | 预览 + BullMQ | 5～7 天 |
| 7 | Files 上传 | 7～10 天 |
| 8 | Tags/Versions/Archive | 4～5 天 |
| 9 | 社交分享 | 5～7 天 |
| 10 | Socket | 4～5 天 |
| 11 | Admin/VIP/Log | 4～5 天 |
| 12 | 收尾下线 | 3～5 天 |
| **合计** | | **约 7～11 周**（阶段 0～1 已省 1 周） |

全职投入可压缩至 **3～5 周**。

---

## 9. 关键决策（待你确认）

| # | 决策点 | 建议 |
|---|--------|------|
| 1 | Prisma schema 权威位置 | 最终以 Nest `prisma/` 为准，Express 冻结 |
| 2 | Worker 是否迁 Nest | 队列不变；Worker 可独立到最后再迁 |
| 3 | 是否拆微服务 | 不建议；单体 Nest Module 即可 |
| 4 | 每阶段是否要求前端可切换 | 建议要；否则难以验证 |
| 5 | 共享代码策略 | 大 Service（preview、mergeUpload）先复制到 Nest，稳定后再抽公共包（可选） |

---

## 10. 本地开发命令

```bash
# Nest（迁移目标）
cd file_management_backend_nest
cp .env.example .env    # DATABASE_URL、JWT_SECRET 与 Express 一致
pnpm install
pnpm prisma:generate
pnpm start:dev          # http://localhost:3002

# Express（迁移源，迁移期仍运行）
cd ../file_management_backend
pnpm dev                # http://localhost:3000

# 前端临时联调 Nest
# VITE_API_BASE_URL=http://localhost:3002
```

---

## 11. 端点总览 Checklist

> 迁移完成一项，将 `⬜` 改为 `✅`。

**Auth（3/15）** · **User（1/4）** · **Files（0/39）** · **其余（0/32）** · **Socket（0/1）**

完整端点列表见上文各阶段表格。全部 ✅ 后即可执行阶段 12 下线 Express。

---

*文档版本：v1.0 · 与 Cursor 计划书同步，供人工评审后按阶段实施。*
