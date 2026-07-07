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
| **S6** | **Files 上传** | **✅** |
| **S7** | **Tags + Versions + Archive** | **✅** |
| **S8** | **Friendship + Message + Share** | **✅** |
| **S9** | **Socket Gateway（实时推送）** | **✅** |

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

## API 对照（S6 Files 上传）

| Express | Nest | 状态 |
|---------|------|------|
| `POST /api/files/check-exists` | 同 | ✅ |
| `POST /api/files/check-name` | 同 | ✅ |
| `POST /api/files/upload-chunk` | 同 | ✅ |
| `GET /api/files/chunks/:fileHash` | 同 | ✅ |
| `POST /api/files/merge-chunks` | 同 | ✅ |
| `POST /api/files/instant-upload` | 同 | ✅ |
| `POST /api/files/upload` | 同 | ✅ |
| `POST /api/files/folder` | 同 | ✅ |

分片临时目录 `chunks/<fileHash>/` 与 Express 共用；最终文件写入 `UPLOAD_PATH`（默认 `../file_management_backend/uploads`）。

**注意**：`check-name` 响应为 `{ success, exists }`（无 `data` 包装），与 Express 一致。

## S6 验收后前端切换

```bash
# file_management_frontend/.env
VITE_API_BASE_URL=http://localhost:3002
```

验证：拖拽/选择上传、大文件分片、秒传、新建文件夹。

回退：`VITE_API_BASE_URL=http://localhost:3000`

## API 对照（S7 Tags + Versions + Archive）

| Express | Nest | 状态 |
|---------|------|------|
| `GET /api/files/tags` | 同 | ✅ |
| `POST /api/files/tags` | 同 | ✅ |
| `PUT /api/files/tags/:tagId` | 同 | ✅ |
| `DELETE /api/files/tags/:tagId` | 同 | ✅ |
| `PUT /api/files/:id/tags` | 同 | ✅ |
| `GET /api/files/:id/versions` | 同 | ✅ |
| `POST /api/files/:id/versions/:versionId/rollback` | 同 | ✅ |
| `GET /api/files/:id/versions/:versionId/download` | 同 | ✅ |
| `GET /api/files/:id/archive/entries` | 同 | ✅ |
| `POST /api/files/:id/archive/conflicts` | 同 | ✅ |
| `POST /api/files/:id/archive/extract` | 同 | ✅ |

在线解压需 **VIP 或管理员**；解压落盘复用 `MergeUploadService.registerLocalFileInDrive`。

## S7 验收

验证：标签 CRUD、文件版本列表/回滚/下载、ZIP 在线解压（VIP/管理员）。

## 测试

```bash
pnpm test:e2e    # Auth + Health + Files + User + UserPreference e2e
```

S2 e2e 覆盖：列表、详情、下载、text-chunk、回收站、重命名、移动、批量删除/恢复。
S3 e2e 覆盖：AI 401/400/404、text/plain 流式 mock 响应。
S4 e2e 覆盖：预览 401/404/400、preview-state/status JSON、有缓存时 PDF 流。
S5 e2e 覆盖：profile GET/PUT、avatar 上传、user search、user-preferences GET/PUT。
S6 e2e 覆盖：check-exists、check-name、分片上传+合并、instant-upload 404、传统 upload、folder 创建与重名。
S7 e2e 覆盖：tags CRUD、versions 列表/回滚/下载、archive 403/entries/conflicts/extract。
S8 e2e 覆盖：friendship 请求/接受/列表/删除、message 发送/历史/已读/未读汇总、share 创建/公开访问/我的分享/访问日志、**save-to-my-drive 转存（好友/分享链接/聊天 fileId）**。
S9 e2e 覆盖：Socket 无 token/无效 token 拒绝、有效 token 连接、`message:new` 推送、`friendship:sync` 推送。
S6–S8 手测缺陷回归见 `docs/plans/2026-07-07-regression-tests-supplement.md`（OGG Range/MIME、转存 404 等）。

## API 对照（S8 Friendship + Message + Share）

| Express | Nest | 状态 |
|---------|------|------|
| `GET /api/friendships` | 同 | ✅ |
| `GET /api/friendships/requests/pending` | 同 | ✅ |
| `POST /api/friendships/request` | 同 | ✅ |
| `PUT /api/friendships/request/:requestId/accept` | 同 | ✅ |
| `PUT /api/friendships/request/:requestId/reject` | 同 | ✅ |
| `DELETE /api/friendships/:friendId` | 同 | ✅ |
| `GET /api/messages/unread-summary` | 同 | ✅ |
| `POST /api/messages` | 同 | ✅ |
| `GET /api/messages/:friendId` | 同 | ✅ |
| `PUT /api/messages/:friendId/read` | 同 | ✅ |
| `POST /api/shares` | 同 | ✅ |
| `GET /api/shares/mine` | 同 | ✅ |
| `GET /api/shares/:shareId/access-logs` | 同 | ✅ |
| `GET /api/shares/public/:shareCode` | 同（公开） | ✅ |
| `POST /api/shares/public/:shareCode/access` | 同（公开） | ✅ |
| `GET /api/shares/public/:shareCode/file/:userFileId/download` | 同（公开） | ✅ |
| `POST /api/files/:id/save-to-my-drive` | 同（好友/链接分享转存） | ✅ |

`ShareService.verifySharedFileForSave` 供转存校验复用。Socket 推送见 **S9**。

## S9 — Socket Gateway

**实施文档**：`docs/plans/2026-07-07-s9-socket-design.md`、`docs/plans/2026-07-07-s9-socket-implementation.md`

| 能力 | Express | Nest | 状态 |
|------|---------|------|------|
| 路径 `/socket.io` | `src/realtime/socket.ts` | `src/realtime/contacts.gateway.ts` | ✅ |
| 握手 JWT + sessionVersion | 同 | `socket-auth.util.ts` | ✅ |
| 房间 `user:{id}` | 同 | 连接后自动 join | ✅ |
| 事件 `message:new` | Message 创建后推送接收方 | `MessageService` → `RealtimeEmitterService` | ✅ |
| 事件 `friendship:sync` | 好友请求/接受/拒绝/删除 | `FriendshipService` → `RealtimeEmitterService` | ✅ |
| Redis Adapter（多实例） | 有 `REDIS_URL` 时启用 | `ContactsGateway.afterInit` | ✅ |

**手测清单**（双浏览器 / 双账号）：

1. 账号 A、B 互加好友后，A 发消息，B 聊天页**无需刷新**即出现新消息（`message:new`）。
2. A 向 B 发好友请求，B 好友页**实时**出现待处理请求（`friendship:sync`）。
3. 前端 `VITE_API_BASE_URL` 指向 Nest `3002`，确认 `contactsSocket.ts` 能连上。

VIP/Admin 相关 Socket 推送留 **S10**。

## S8 验收

验证：加好友、发消息、创建分享链接、未登录访问公开分享页。
