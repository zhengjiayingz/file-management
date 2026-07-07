# Express → Nest 迁移路线图

与 `../file_management_backend` 共用 Prisma / MySQL。Nest 默认端口 **3002**。

## 阶段进度

| 阶段 | 模块 | 状态 |
|------|------|------|
| P0 | 骨架、Config、Prisma、Health、全局校验 | ✅ |
| P1 | 横切：Redis、限流、Guards、异常 Filter | ✅ |
| **S1** | **Auth 15 端点全量** | **✅** |
| P1 | User：GET /user/profile | ✅ |
| S2 | Files 读（最小集） | ✅ |
| S3 | AI 流式问答 | ✅ |
| S4 | 预览 + BullMQ | ✅ |
| S5 | User + UserPreference | ✅ |

## 启动

```bash
cp .env.example .env   # 或与 Express 共用 .env（e2e 会自动读取 ../file_management_backend/.env）
pnpm install
pnpm prisma:generate
pnpm start:dev
```

## API 对照（Auth 全量）

| Express | Nest | 状态 |
|---------|------|------|
| `POST /api/auth/register` | 同 | ✅ |
| `GET /api/auth/password-policy` | 同 | ✅ |
| `POST /api/auth/login` | 同 | ✅ |
| `POST /api/auth/mfa/verify` | 同 | ✅ |
| `POST /api/auth/forgot-password` | 同 | ✅ |
| `POST /api/auth/refresh` | 同 | ✅ |
| `POST /api/auth/logout` | 同 | ✅ |
| `POST /api/auth/change-password` | 同 | ✅ |
| `POST /api/auth/mfa/setup/start` | 同 | ✅ |
| `POST /api/auth/mfa/setup/confirm` | 同 | ✅ |
| `POST /api/auth/mfa/setup/cancel` | 同 | ✅ |
| `POST /api/auth/mfa/disable` | 同 | ✅ |
| `GET /api/auth/me` | 同 | ✅ |
| `POST /api/auth/sessions/list` | 同 | ✅ |
| `POST /api/auth/sessions/revoke` | 同 | ✅ |
| `GET /api/user/profile` | 同 | ✅ |
| `GET /health` | 同（无 `/api` 前缀） | ✅ |

## S1 验收后前端切换

```bash
# file_management_frontend/.env
VITE_API_BASE_URL=http://localhost:3002
```

验证：注册、登录、MFA、会话管理、改密、忘记密码。

回退：`VITE_API_BASE_URL=http://localhost:3000`

## API 对照（S2 Files 读最小集）

| Express | Nest | 状态 |
|---------|------|------|
| `GET /api/files` | 同 | ✅ |
| `GET /api/files/:id` | 同 | ✅ |
| `GET /api/files/:id/download` | 同 | ✅ |
| `GET /api/files/:id/thumbnail` | 同 | ✅ |
| `GET /api/files/:id/text-chunk` | 同 | ✅ |
| `DELETE /api/files/:id` | 同 | ✅ |
| `POST /api/files/:id/restore` | 同 | ✅ |
| `DELETE /api/files/:id/permanent` | 同 | ✅ |
| `POST /api/files/batch/delete` | 同 | ✅ |
| `POST /api/files/batch/restore` | 同 | ✅ |
| `POST /api/files/batch/move` | 同 | ✅ |
| `POST /api/files/batch/permanent-delete` | 同 | ✅ |
| `POST /api/files/batch/download-zip` | 同 | ✅ |
| `PUT /api/files/:id/rename` | 同 | ✅ |
| `PUT /api/files/:id/move` | 同 | ✅ |

## S2 验收后前端切换

```bash
# file_management_frontend/.env
VITE_API_BASE_URL=http://localhost:3002
```

验证：文件列表、下载、txt 预览、回收站（删除/恢复/永久删除）、重命名、移动、批量操作。

**注意**：上传（S6）、Office 预览（S4）仍在 Express，手测时相关功能会 404。

回退：`VITE_API_BASE_URL=http://localhost:3000`

## API 对照（S3 AI 流式问答）

| Express | Nest | 状态 |
|---------|------|------|
| `POST /api/files/:id/ai/ask` | 同 | ✅ |

流式响应为 `text/plain`（非 JSON 包装），与 Express 一致。需配置 `AI_API_KEY`（及可选 `AI_BASE_URL`、`AI_MODEL`）。

## S3 验收后前端切换

```bash
# file_management_frontend/.env
VITE_API_BASE_URL=http://localhost:3002
```

验证：`TextChunkPreviewDialog` 划词问答、流式输出、点击停止可中断。

**注意**：上传（S6）仍在 Express。

回退：`VITE_API_BASE_URL=http://localhost:3000`

## API 对照（S4 Office 预览 + BullMQ）

| Express | Nest | 状态 |
|---------|------|------|
| `GET /api/files/:id/preview` | 同 | ✅ |
| `GET /api/files/:id/preview-state` | 同 | ✅ |
| `GET /api/files/:id/preview-status` | 同 | ✅ |

BullMQ 队列名 `preview-convert` 不变；预览缓存默认目录 `../file_management_backend/previews`（与 Express Worker 共用）。Worker 仍跑 Express `preview.worker.ts`。

## S4 验收后前端切换

```bash
# file_management_frontend/.env
VITE_API_BASE_URL=http://localhost:3002
```

验证：双击 Word/PPT 打开 `OfficePreviewDialog`、PDF 预览、状态栏轮询 partial→full。

**注意**：上传（S6）仍在 Express。

回退：`VITE_API_BASE_URL=http://localhost:3000`

## API 对照（S5 User + UserPreference）

| Express | Nest | 状态 |
|---------|------|------|
| `GET /api/user/profile` | 同 | ✅ |
| `PUT /api/user/profile` | 同 | ✅ |
| `POST /api/user/avatar` | 同 | ✅ |
| `GET /api/user/search` | 同 | ✅ |
| `GET /api/user-preferences` | 同 | ✅ |
| `PUT /api/user-preferences` | 同 | ✅ |

头像存储至 `../file_management_backend/uploads/avatars`，与 Express 共用；静态路径 `/uploads/avatars/*` 由 `main.ts` 提供。

## S5 验收

验证：设置页更新邮箱、上传头像、主题/语言切换、好友搜索用户。

## 测试

```bash
pnpm test:e2e    # Auth + Health + Files + User + UserPreference e2e
```

S2 e2e 覆盖：列表、详情、下载、text-chunk、回收站、重命名、移动、批量删除/恢复。
S3 e2e 覆盖：AI 401/400/404、text/plain 流式 mock 响应。
S4 e2e 覆盖：预览 401/404/400、preview-state/status JSON、有缓存时 PDF 流。
S5 e2e 覆盖：profile GET/PUT、avatar 上传、user search、user-preferences GET/PUT。
