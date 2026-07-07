# S4 Office 预览 + BullMQ 入队 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `GET /api/files/:id/preview`、`preview-state`、`preview-status` 迁入 Nest，BullMQ 入队与 Express Worker 共用队列 `preview-convert`，预览缓存目录与 Express 共用。

**Architecture:** 在 `files/preview/` 下新建 `PreviewQueueService`（bullmq 生产者）+ `FilesPreviewService`（从 Express `preview.service.ts` 移植）+ `FilesPreviewController`；`PREVIEWS_PATH` 默认指向 `../file_management_backend/previews`；Worker 仍跑 Express `preview.worker.ts`。

**Tech Stack:** NestJS 11、bullmq、Supertest、Jest e2e

**设计文档：** [2026-07-06-nest-migration-design.md](./2026-07-06-nest-migration-design.md) §S4

**Express 参照：**
- `../file_management_backend/src/queues/preview.queue.ts`
- `../file_management_backend/src/services/preview.service.ts`
- `../file_management_backend/src/controllers/file/query.controller.ts`（`previewFile`、`getOfficePreviewState`）

---

## 端点范围

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/files/:id/preview` | GET | Office → PDF 流，`X-Preview-Pdf-Phase` |
| `/api/files/:id/preview-state` | GET | 磁盘阶段 + BullMQ 任务状态 |
| `/api/files/:id/preview-status` | GET | 与 preview-state 相同（别名） |

---

## Task 1: 依赖与队列 Service

**Files:**
- Modify: `package.json` — 添加 `bullmq`
- Create: `src/files/preview/preview-queue.types.ts`
- Create: `src/files/preview/preview-path.utils.ts`
- Create: `src/files/preview/preview-queue.service.ts`

**验收：** `pnpm install && pnpm build`

---

## Task 2: FilesPreviewService

**Files:**
- Create: `src/files/preview/files-preview.service.ts`

从 Express `preview.service.ts` 移植（不含 `processPreviewConvertJob`，Worker 仍在 Express）。

**验收：** `pnpm build`

---

## Task 3: Controller + Module 注册

**Files:**
- Create: `src/files/preview/files-preview.controller.ts`
- Modify: `src/files/files.module.ts`

**验收：** `pnpm build`

---

## Task 4: E2E

**Files:**
- Create: `test/e2e/files-preview.e2e-spec.ts`
- Modify: `test/helpers/files.helper.ts` — `seedOfficeFile`、`writePreviewPdfCache`

**用例：**
- 无 Token → 401
- 非 Office 文件 preview-state → 400
- 文件不存在 → 404
- Office 文件 + 预置 PDF 缓存 → preview 200 `application/pdf`
- preview-state → 200 JSON（`phase`、`queueAvailable`、`jobs`）
- preview-status 与 preview-state 响应一致

Run: `pnpm test:e2e`

---

## Task 5: MIGRATION.md + .env.example

**Files:**
- Modify: `MIGRATION.md` — S4 状态 ✅
- Modify: `.env.example` — 可选 `PREVIEWS_PATH`

---

## 验收清单

- [ ] `pnpm build`
- [ ] `pnpm test:e2e` 全绿
- [ ] 队列名 `preview-convert` 不变
- [ ] 预览缓存与 Express Worker 共用目录
- [ ] 前端 `OfficePreviewDialog` 可预览 Word/PPT
