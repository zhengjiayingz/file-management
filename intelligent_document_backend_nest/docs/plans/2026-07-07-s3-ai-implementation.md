# S3 AI 流式问答 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `POST /api/files/:id/ai/ask` 迁入 Nest，保持与 Express 一致的 text/plain 流式响应与 abort 行为。

**Architecture:** 在 `files/ai/` 下新建 `FilesAiController` + `FilesAiService`；AI SDK 逻辑从 Express `ai.service.ts` 移植；e2e 用 `jest.mock('ai')` 避免真实 API 调用。

**Tech Stack:** NestJS 11、`ai` v7、`@ai-sdk/openai`、Supertest、Jest e2e

**设计文档：** [2026-07-06-nest-migration-design.md](./2026-07-06-nest-migration-design.md) §S3

**Express 参照：**
- `../file_management_backend/src/controllers/file/ai.controller.ts`
- `../file_management_backend/src/services/ai.service.ts`

---

## 端点范围

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/files/:id/ai/ask` | POST | 划词问答，流式纯文本 |

Body: `{ question, selectedText, messages?, fileName? }`

---

## Task 1: 依赖与 Service

**Files:**
- Modify: `package.json` — 添加 `ai`、`@ai-sdk/openai`
- Create: `src/files/ai/files-ai.service.ts`

**验收：** `pnpm install && pnpm build`

---

## Task 2: Controller + Module 注册

**Files:**
- Create: `src/files/ai/files-ai.controller.ts`
- Modify: `src/files/files.module.ts` — 注册 `FilesAiController`、`FilesAiService`

**验收：** `pnpm build`

---

## Task 3: E2E

**Files:**
- Create: `test/e2e/files-ai.e2e-spec.ts`

**用例：**
- 无 Token → 401
- 无效 body（缺 question）→ 400 JSON
- 文件不存在 → 404 JSON
- 正常请求 → 200，`text/plain` 流含 mock 文本

Run: `pnpm test:e2e`（全量）

---

## Task 4: MIGRATION.md

**Files:**
- Modify: `MIGRATION.md` — S3 状态 ✅、API 对照表

---

## 验收清单

- [ ] `pnpm build`
- [ ] `pnpm test:e2e` 全绿
- [ ] 流式响应非 JSON 包装（与 Express 一致）
- [ ] `req.on('close')` → abortSignal
