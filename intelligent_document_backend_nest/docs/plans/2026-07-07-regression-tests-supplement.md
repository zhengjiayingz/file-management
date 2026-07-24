# S6–S8 回归测试补全（手测缺陷 → e2e）

> **背景**：S6–S8 实现时未严格 TDD，以下缺陷靠手测才发现。本文档补写对应 e2e，防止回归。

## 缺陷与回归用例对照

| 手测缺陷 | 根因 | 回归 e2e 位置 |
|----------|------|----------------|
| 分享转存 `Cannot POST .../save-to-my-drive` 404 | S8 未迁 `FilesManage` 写端点 | `files-manage.e2e-spec.ts` — save-to-my-drive 路由存在 |
| 公开链接转存失败 | 未测 `shareCode` + `extractCode` 路径 | `files-manage` / `share.e2e-spec.ts` — 公开分享完整流程 |
| 好友聊天发文件后无法转存 | 未测 `message` + `fileId` 链路 | `message.e2e-spec.ts` — 带 fileId 消息转存 |
| OGG 无法记进度 | 下载缺 Range / MIME 错误 | `files-query.e2e-spec.ts` — audio/ogg + Accept-Ranges + 206 |
| `GET /api/files/tags` 400 | 路由被 `:id` 抢占 | `files-query.e2e-spec.ts` — tags 不得 400（已有） |

## 运行

```bash
cd file_management_backend_nest
pnpm test:e2e test/e2e/files-manage.e2e-spec.ts
pnpm test:e2e test/e2e/message.e2e-spec.ts
pnpm test:e2e test/e2e/share.e2e-spec.ts
pnpm test:e2e test/e2e/files-query.e2e-spec.ts
pnpm test:e2e   # 全量
```

## 仍须手测（无前端 e2e）

- 转存后网盘列表刷新（`driveEvents.ts`）
- OGG 播放进度 localStorage（`VideoPlayerDialog`）
- 前端 `deleteFile` API 命名（已修，无自动化）
