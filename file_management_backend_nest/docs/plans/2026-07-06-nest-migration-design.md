# Express → Nest 迁移设计文档

> **版本**：v1.0  
> **日期**：2026-07-06  
> **状态**：已评审确认，待进入实施计划  
> **关联文档**：[MIGRATION_PLAN.md](../../MIGRATION_PLAN.md)（端点清单与工期粗估）

---

## 1. 背景与目标

### 1.1 项目背景

网盘后端当前运行于 Express（`../file_management_backend`，端口 **3000**），约 94 个 REST 端点 + Socket.IO + 预览 Worker。Nest 迁移版（`file_management_backend_nest`，端口 **3002**）已完成阶段 0～1 及部分 Auth/User：

| 已完成 | 未完成 |
|--------|--------|
| 脚手架、Config、Prisma、Health、ValidationPipe | Auth 剩余 12 端点 |
| Redis、全局限流、登录限流、Guards、异常 Filter | Files（39 端点）及全部业务模块 |
| Auth：login / refresh / logout | Socket、BullMQ Worker 迁移 |
| User：GET /profile | Express 下线 |

### 1.2 终局目标

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
| 安全保障 | **Express 代码冻结** — 迁移期零业务代码变更，随时可切回 3000 |

> **澄清**：「学习 / 简历价值」指迁移过程的排期与重构策略，不是只迁一部分就停止。双栈运行是迁移期临时手段（约 5～6 周），终局仍是 100% Nest。

---

## 2. 架构决策

### 2.1 方案选型

在三种路线中选定 **方案三：纵向切片 + 亮点穿插**。

| 方案 | 描述 | 不选原因 |
|------|------|----------|
| 方案一 | 严格依赖序（Auth → User → Files 读 → …） | 亮点模块偏后，前 3～4 周简历故事弱 |
| 方案二 | Auth 后立刻冲 AI + BullMQ + Socket | 强依赖 Files 读 / Message，边重构易返工 |
| **方案三** ⭐ | 依赖合理前提下穿插亮点 | **选定** — 兼顾学习价值与可演示进度 |

### 2.2 Express 冻结原则

自迁移启动至阶段 S11 下线前：

- `../file_management_backend` **零业务代码变更**（紧急安全漏洞除外）
- Nest 为**唯一开发目标**；Express 为对照基准与热回退副本
- **回退操作**：前端 `VITE_API_BASE_URL` 改回 `http://localhost:3000` + 可选停止 Nest 进程
- 不需要 git revert Nest 即可恢复项目可运行状态

```
┌─────────────┐     默认 / 回退      ┌──────────────────────────┐
│  Vue 前端   │ ──────────────────► │ Express :3000（冻结不动）  │
│             │                     │ 完整 94 端点，随时可用     │
│ VITE_API_   │     联调 / 灰度      ├──────────────────────────┤
│ BASE_URL    │ ──────────────────► │ Nest :3002（唯一改动点）   │
└─────────────┘                     └──────────────────────────┘
         │                                    │
         └──────────── 共用 ──────────────────┘
              MySQL · Redis · MinIO · uploads 目录
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
| 预览 Worker | S4 前继续跑 Express `preview.worker.ts` | 队列名 `preview-convert` 不变；S11 迁 `@nestjs/bullmq` Processor |
| Socket | S9 与 Message 同阶段交付 | `@nestjs/websockets` + Redis Adapter |
| 静态资源 | Nest 只读挂载 Express uploads 目录 | 已在 `main.ts` 配置：`../file_management_backend/uploads` |
| 共享代码 | **不建 monorepo 公共包** | 迁移完成、Express 下线后再评估是否抽取 |
| 双栈前端 | 全局 `VITE_API_BASE_URL` 切换 | 某模块 e2e 全绿后才允许切换；未验收前保持 3000 |

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
    storage/
    dto/
  ai/
  preview/            # BullMQ 入队 + 状态查询
  admin/
  vip/
  share/
  friendship/
  message/
  log/
  realtime/           # Socket Gateway
  jobs/               # @nestjs/schedule 定时清理
```

---

## 3. 分阶段执行计划

半职 4h/天，总工期约 **5～6 周**（S1～S10 双栈期，S11 下线 Express）。

每阶段统一流程：**迁端点 → 边迁边重构 → 写 e2e → 前端灰度 → 回退检查点**。

### S1 — Auth 补全（3 天）

**目标**：15 个 Auth 端点全部对齐 Express。

| 端点 | 方法 | 状态 |
|------|------|------|
| `/api/auth/login` | POST | ✅ |
| `/api/auth/refresh` | POST | ✅ |
| `/api/auth/logout` | POST | ✅ |
| `/api/auth/register` | POST | ⬜ |
| `/api/auth/password-policy` | GET | ⬜ |
| `/api/auth/mfa/verify` | POST | ⬜ |
| `/api/auth/forgot-password` | POST | ⬜ |
| `/api/auth/change-password` | POST | ⬜ |
| `/api/auth/mfa/setup/start` | POST | ⬜ |
| `/api/auth/mfa/setup/confirm` | POST | ⬜ |
| `/api/auth/mfa/setup/cancel` | POST | ⬜ |
| `/api/auth/mfa/disable` | POST | ⬜ |
| `/api/auth/me` | GET | ⬜ |
| `/api/auth/sessions/list` | POST | ⬜ |
| `/api/auth/sessions/revoke` | POST | ⬜ |

**重构**：拆 `SessionService`、`MfaService`、`PasswordService`；补全 DTO。

**建议顺序**：`register` → `mfa/*` → `sessions/*` → `change-password` → `forgot-password`

**验收**：`test/e2e/auth.e2e-spec.ts` 15 端点全绿；前端切 3002 测 MFA / 会话踢人全流程。

**回退检查点**：e2e 失败或前端回归异常 → `.env` 改回 3000。

---

### S2 — Files 读（最小集，4 天）

**目标**：网盘主路径读操作，**不含上传**。

| 端点 | 方法 |
|------|------|
| `/api/files` | GET |
| `/api/files/:id` | GET |
| `/api/files/:id/download` | GET |
| `/api/files/:id/thumbnail` | GET |
| `/api/files/:id/text-chunk` | GET |
| `/api/files/:id` | DELETE |
| `/api/files/:id/restore` | POST |
| `/api/files/:id/permanent` | DELETE |
| `/api/files/batch/*` | POST |
| `/api/files/:id/rename` | PUT |
| `/api/files/:id/move` | PUT |

**重构**：新建 `StorageModule`；拆 `FilesQueryService` + `FilesManageService`；从 Express `query.controller.ts`（1300+ 行）按职责提取。

**验收**：列表、下载、txt 预览、回收站 e2e 对比 Express。

**前端切换**：⚠️ 仅建议文件页联调；未迁上传前不建议整站长期切 3002。

---

### S3 — AI 流式问答（2 天）

| 端点 | 方法 |
|------|------|
| `/api/files/:id/ai/ask` | POST |

**重构**：新建 `AiModule`；`pipeTextStreamToResponse`；`req.on('close')` → `abortSignal`。

**依赖**：S2 最小文件读（`getFileById`、text-chunk）。

**验收**：curl 验证 chunk 连续输出；前端 `TextChunkPreviewDialog` 划词问答正常。

---

### S4 — 预览 + BullMQ 入队（4 天）

| 端点 | 方法 |
|------|------|
| `/api/files/:id/preview` | GET |
| `/api/files/:id/preview-state` | GET |
| `/api/files/:id/preview-status` | GET |

**重构**：新建 `PreviewModule`；`@nestjs/bullmq` 入队；**Worker 继续跑 Express**。

**验收**：预览状态轮询 e2e；确认队列名 `preview-convert` 不变；Office 预览对话框正常。

---

### S5 — User + UserPreference（2 天）

| 端点 | 方法 | 状态 |
|------|------|------|
| `/api/user/profile` | GET | ✅ |
| `/api/user/profile` | PUT | ⬜ |
| `/api/user/avatar` | POST | ⬜ |
| `/api/user/search` | GET | ⬜ |
| `/api/user-preferences` | GET/PUT | ⬜ |

**重构**：`FileInterceptor` + sharp 头像；新建 `UserPreferenceModule`。

**验收**：头像上传 + profile e2e；可尝试整站切 3002 试跑。

---

### S6 — Files 上传（6 天）⚠️ 最重阶段

| 端点 | 方法 |
|------|------|
| `/api/files/check-exists` | POST |
| `/api/files/check-name` | POST |
| `/api/files/upload-chunk` | POST |
| `/api/files/chunks/:fileHash` | GET |
| `/api/files/merge-chunks` | POST |
| `/api/files/instant-upload` | POST |
| `/api/files/upload` | POST |
| `/api/files/folder` | POST |

**重构**：拆 `MergeUploadService`、`ChunkService`；从 Express `mergeUpload.service.ts` 按步骤提取。

**验收**：分片 / 秒传 / 合并全链路 e2e；**上传必须切 3002 验收**。

**回退检查点**：上传链路失败 → 立即回 3000。

---

### S7 — Tags + Versions + Archive（3 天）

| 子模块 | 来源 |
|--------|------|
| Tags | `fileTag.controller.ts` |
| Versions | `version.controller.ts` |
| Archive | `archiveExtract.controller.ts` |

**验收**：各子模块独立 e2e 文件。

---

### S8 — 社交三模块（4 天）

| 模块 | 端点数 |
|------|--------|
| Friendship | 6 |
| Message | 4 |
| Share | 6（含公开链接，无需登录） |

**验收**：Share 公开链接单独测；Message 为 S9 Socket 前置。

---

### S9 — Socket Gateway（3 天）

**来源**：Express `src/realtime/socket.ts`

- `MessagesGateway` + Redis Adapter（多实例）
- 握手校验 JWT + `sessionVersion`
- 与 Message REST 联调

**验收**：消息推送手测 + 握手拒绝非法 Token。

---

### S10 — Admin + VIP + Log（3 天）

| 模块 | 端点数 | 备注 |
|------|--------|------|
| Admin | 9 | `@Roles('admin')` |
| VIP | 8 | 申请审核 |
| Log | 1 | 操作日志 |

**验收**：管理员权限 e2e。

---

### S11 — 收尾与 Express 下线（3 天）

| 任务 | 说明 |
|------|------|
| Swagger | `@nestjs/swagger` 对齐 `/api-docs` |
| 定时清理 | `@nestjs/schedule` 迁 `cleanup.job.ts` |
| Worker 迁移 | Express `preview.worker.ts` → Nest `@Processor` |
| e2e 回归 | 全模块 e2e 绿灯 |
| 端口切换 | Nest → **3000**，Express **停服** |
| docker-compose | 替换 `api` 服务启动命令 |
| Prisma 权威 | 删除 Express 侧 schema 维护 |
| 文档 | 更新 `MIGRATION.md` 为完成态 |

**此阶段后**：双栈期结束，仅运行 Nest 单进程。

---

### 阶段依赖图

```
S1 Auth ──► S2 Files读 ──► S3 AI
                │
                ├──► S4 预览+BullMQ
                │
                ├──► S6 上传 ──► S7 Tags/Versions/Archive
                │
S5 User ◄──（可与 S3/S4 并行）

S8 社交 ──► S9 Socket ──► S10 Admin/VIP/Log ──► S11 下线
```

**暂停策略**：任一阶段可暂停；已迁模块留 Nest，未迁走 Express 3000；恢复时从下一阶段继续，无需推倒重来。

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
    health.e2e-spec.ts     # 已有
    auth.e2e-spec.ts
    files-query.e2e-spec.ts
    files-manage.e2e-spec.ts
    files-upload.e2e-spec.ts
    ai.e2e-spec.ts
    preview.e2e-spec.ts
    user.e2e-spec.ts
    friendship.e2e-spec.ts
    message.e2e-spec.ts
    share.e2e-spec.ts
    admin.e2e-spec.ts
    vip.e2e-spec.ts
```

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

### 4.6 阶段门禁

| 门禁 | 条件 |
|------|------|
| 模块完成 | 该模块 e2e 全绿 |
| 允许前端切 3002 | 已迁模块 e2e 全绿 + 主流程手测通过 |
| 允许 S11 下线 | 全模块 e2e 全绿 + docker-compose 验证 |

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

### 6.2 共享基础设施

| 资源 | 共用方式 | 风险 |
|------|----------|------|
| MySQL | 同一 `DATABASE_URL` | Nest 写脏数据会影响 Express；靠 e2e 门禁 |
| Redis | 同一实例 | 限流计数、Socket Adapter 共享 |
| MinIO / local storage | 同一 bucket / uploads 目录 | Nest 只读挂载或同路径写入 |
| BullMQ | 队列名 `preview-convert` | Worker 消费不变 |
| JWT | 同一 `JWT_SECRET` | 切端口不影响已登录状态 |

### 6.3 Prisma schema 变更规则

迁移期所有 schema 变更：

1. 只在 Nest `prisma/schema.prisma` 修改
2. 必须**向后兼容**（additive only）
3. `pnpm prisma:generate` 后在 Nest 侧验证
4. Express 侧**不修改代码**；若 Express Prisma Client 因新字段报错，评估是否需紧急 `prisma generate`（尽量避免）

---

## 7. 风险与应对

| 风险 | 应对 |
|------|------|
| Files 上传/预览代码量大 | Service 按职责拆分，不重写业务逻辑；Controller 薄封装 |
| 两套路由漂移 | 本文档端点 checklist + 每模块 e2e 对比 |
| Prisma schema 双份历史 | 即日起 Nest 权威；Express 冻结 |
| Socket 与 REST 不同步 | S8 Message + S9 Socket 绑定交付 |
| Worker 依赖 LibreOffice | S4 前 Express Worker 不变；S11 再迁 |
| 边迁边重构引入回归 | 每阶段 e2e 全绿才允许前端切换 |
| 工期暂停 | 任意阶段可暂停；Express 3000 兜底 |
| Nest 出严重 bug | `.env` 改回 3000，Express 零改动即时恢复 |

---

## 8. 本地开发

```bash
# Nest（迁移目标，唯一开发改动点）
cd file_management_backend_nest
cp .env.example .env    # DATABASE_URL、JWT_SECRET 与 Express 一致
pnpm install
pnpm prisma:generate
pnpm start:dev          # http://localhost:3002

# Express（冻结参照 + 回退副本，正常运行但不改代码）
cd ../file_management_backend
pnpm dev                # http://localhost:3000

# 前端切换
# file_management_frontend/.env
VITE_API_BASE_URL=http://localhost:3002   # 联调 Nest
VITE_API_BASE_URL=http://localhost:3000   # 回退 Express
```

---

## 9. 端点进度总览

| 模块 | 进度 | 阶段 |
|------|------|------|
| Auth | 3/15 | S1 |
| User | 1/4 | S5 |
| UserPreference | 0/2 | S5 |
| Files 读 | 0/11 | S2 |
| AI | 0/1 | S3 |
| Preview | 0/3 | S4 |
| Files 上传 | 0/8 | S6 |
| Tags/Versions/Archive | 0/11 | S7 |
| Friendship | 0/6 | S8 |
| Message | 0/4 | S8 |
| Share | 0/6 | S8 |
| Socket | 0/1 | S9 |
| Admin | 0/9 | S10 |
| VIP | 0/8 | S10 |
| Log | 0/1 | S10 |

全部 ✅ 后执行 S11 下线 Express。

---

## 10. 下一步

1. **writing-plans**：为 S1 Auth 补全编写详细实施计划（`docs/plans/2026-07-06-s1-auth-implementation.md`）
2. **using-git-worktrees**（可选）：创建隔离 worktree 开发 S1
3. **executing-plans**：按实施计划分批执行，批间汇报

---

*本文档由 superpowers brainstorming 流程产出，已与项目方确认架构决策、Express 冻结原则、全量迁移终局目标。*
