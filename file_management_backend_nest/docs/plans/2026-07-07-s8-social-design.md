# S8 Friendship + Message + Share — 设计文档

> 日期：2026-07-07  
> 状态：已评审

## 目标

迁移社交三模块共 **16 端点**，API 契约与 Express 一致；Socket 推送留待 S9。

## 端点范围

### Friendship（6）

| 方法 | 路径 | 认证 |
|------|------|------|
| GET | `/api/friendships` | JWT |
| GET | `/api/friendships/requests/pending` | JWT |
| POST | `/api/friendships/request` | JWT |
| PUT | `/api/friendships/request/:requestId/accept` | JWT |
| PUT | `/api/friendships/request/:requestId/reject` | JWT |
| DELETE | `/api/friendships/:friendId` | JWT |

响应格式：与 Express 一致（列表为裸数组；写操作为 `{ message, friendship? }`）。

### Message（4）

| 方法 | 路径 | 认证 |
|------|------|------|
| GET | `/api/messages/unread-summary` | JWT |
| POST | `/api/messages` | JWT |
| GET | `/api/messages/:friendId` | JWT |
| PUT | `/api/messages/:friendId/read` | JWT |

Socket `emitToUser` **S8 不实现**（DB 写入即可，S9 补 Gateway）。

### Share（6）

| 方法 | 路径 | 认证 |
|------|------|------|
| POST | `/api/shares` | JWT |
| GET | `/api/shares/mine` | JWT |
| GET | `/api/shares/:shareId/access-logs` | JWT |
| GET | `/api/shares/public/:shareCode` | **公开** |
| POST | `/api/shares/public/:shareCode/access` | **公开** |
| GET | `/api/shares/public/:shareCode/file/:userFileId/download` | **公开** |

公开端点使用 `@Public()`；响应 `{ success, data? }` 与 Express 一致。

## 架构

```
src/
  friendship/     # friendship.module + controller + service
  message/        # message.module + controller + service + payload util
  share/          # share.module + controller + service（含 visitor 限流逻辑）
```

`ShareService.verifySharedFileForSave()` 导出供后续 Files manage「转存分享」复用。

## 依赖

- `PrismaService`（已有）
- `resolveStorageFilePath`（`files/utils/storagePath.utils.ts`）
- 无新 npm 依赖

## 测试

- `test/e2e/friendship.e2e-spec.ts`
- `test/e2e/message.e2e-spec.ts`
- `test/e2e/share.e2e-spec.ts`
- `test/helpers/social.helper.ts`（双用户注册、建好友）

## 验收

`pnpm build` + `pnpm test:e2e` 全绿；更新 `MIGRATION.md` 与迁移设计文档 S8 ✅。
