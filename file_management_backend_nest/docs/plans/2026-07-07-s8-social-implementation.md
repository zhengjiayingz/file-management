# S8 Friendship + Message + Share Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 迁入 Friendship、Message、Share 共 16 端点；Socket 推送留 S9。

**Architecture:** 三个独立 Nest Module；Share 公开路由 `@Public()`；响应契约对齐 Express。

**设计文档：** [2026-07-07-s8-social-design.md](./2026-07-07-s8-social-design.md)

**Express 参照：**
- `../file_management_backend/src/controllers/friendship.controller.ts`
- `../file_management_backend/src/controllers/message.controller.ts`
- `../file_management_backend/src/controllers/share.controller.ts`

---

## Task 1: Friendship 模块

**Files:**
- Create: `src/friendship/friendship.service.ts`
- Create: `src/friendship/friendship.controller.ts`
- Create: `src/friendship/friendship.module.ts`

6 端点；`emitFriendshipSync` S8 留空。

---

## Task 2: Message 模块

**Files:**
- Create: `src/message/message-payload.util.ts`
- Create: `src/message/message.service.ts`
- Create: `src/message/message.controller.ts`
- Create: `src/message/message.module.ts`

4 端点；`emitToUser` S8 留空。

---

## Task 3: Share 模块

**Files:**
- Create: `src/share/share.service.ts`
- Create: `src/share/share.controller.ts`
- Create: `src/share/share.module.ts`

6 端点；公开 3 个 `@Public()`；下载用 `sendFile`。

---

## Task 4: app.module 注册

Modify: `src/app.module.ts`

---

## Task 5: E2E

- Create: `test/helpers/social.helper.ts`
- Create: `test/e2e/friendship.e2e-spec.ts`
- Create: `test/e2e/message.e2e-spec.ts`
- Create: `test/e2e/share.e2e-spec.ts`

---

## Task 6: 文档

- Modify: `MIGRATION.md`
- Modify: `docs/plans/2026-07-06-nest-migration-design.md`（S8 ✅）

---

## Task 7: 回归测试补全（手测缺陷 → e2e）

> 见 [2026-07-07-regression-tests-supplement.md](./2026-07-07-regression-tests-supplement.md)

- `files-manage.e2e-spec.ts`：`save-to-my-drive` 路由 + shareCode 转存
- `message.e2e-spec.ts`：转存后列表可见、聊天 fileId 转存
- `share.e2e-spec.ts`：公开分享 → 访问 → 转存完整流程
- `files-query.e2e-spec.ts`：audio/ogg MIME、Accept-Ranges、206 Range
