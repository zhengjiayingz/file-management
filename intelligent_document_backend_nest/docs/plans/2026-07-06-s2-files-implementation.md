# S2 Files 读（最小集）Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Files 读/管理最小集 11 类端点迁入 Nest，拆分为 `FilesQueryService` + `FilesManageService` + `StorageModule`，并通过设计文档 §S2 验收 e2e（列表、下载、txt 预览、回收站）。

**Architecture:** `FilesQueryController` / `FilesManageController` 薄路由；`StorageService` 封装 local/minio；`FileBatchHelper` 处理批量展开；`OperationLogService` 记录操作日志。Express 代码冻结不动。

**Tech Stack:** NestJS 11、Prisma 5、sharp、archiver、fluent-ffmpeg、Supertest、Jest e2e

**设计文档：** [2026-07-06-nest-migration-design.md](./2026-07-06-nest-migration-design.md)

**Express 参照：**
- `../file_management_backend/src/controllers/file/query.controller.ts`
- `../file_management_backend/src/controllers/file/manage.controller.ts`

---

## 前置条件

```bash
cd file_management_backend_nest
# .env 须含 DATABASE_URL、JWT_SECRET、UPLOAD_PATH=../file_management_backend/uploads
pnpm install
pnpm prisma:generate
pnpm build
```

---

## 端点范围（S2 最小集）

| 端点 | 方法 | 控制器 |
|------|------|--------|
| `/api/files` | GET | Query |
| `/api/files/:id` | GET | Query |
| `/api/files/:id/download` | GET | Query |
| `/api/files/:id/thumbnail` | GET | Query |
| `/api/files/:id/text-chunk` | GET | Query |
| `/api/files/:id` | DELETE | Manage |
| `/api/files/:id/restore` | POST | Manage |
| `/api/files/:id/permanent` | DELETE | Manage |
| `/api/files/batch/*` | POST | Manage/Query |
| `/api/files/:id/rename` | PUT | Manage |
| `/api/files/:id/move` | PUT | Manage |

---

## Task 0: 基础设施（已实现，补档）

**Files:**
- Create: `src/files/files.module.ts`
- Create: `src/files/files-query.controller.ts` / `files-query.service.ts`
- Create: `src/files/files-manage.controller.ts` / `files-manage.service.ts`
- Create: `src/files/file-batch.helper.ts`
- Create: `src/files/utils/file.utils.ts` / `storagePath.utils.ts`
- Create: `src/storage/storage.module.ts` / `storage.service.ts` / `local.provider.ts`
- Create: `src/operation-log/operation-log.service.ts`
- Modify: `src/app.module.ts` — 注册 `FilesModule`

**验收：** `pnpm build` 通过。

---

## Task 1: E2E 文件种子 Helper

**Files:**
- Create: `test/helpers/files.helper.ts`

**Step 1: 实现 `seedTextFile` / `seedFolder` / `getUserId`**

通过 `PrismaService` 写入 `file_storage` + `user_files`，并在 `UPLOAD_PATH` 落盘真实文本文件。

**Step 2: 验证 helper 可被 e2e import**

Run: `pnpm build`
Expected: PASS

---

## Task 2: Files Query e2e（设计验收核心）

**Files:**
- Modify: `test/e2e/files-query.e2e-spec.ts`

**Step 1: 写测试 — 列表含种子文件**

```typescript
it('GET /api/files 应返回种子文件', async () => { ... });
```

**Step 2: 写测试 — GET /api/files/:id**

**Step 3: 写测试 — GET /api/files/:id/download 返回文件内容**

**Step 4: 写测试 — GET /api/files/:id/text-chunk 返回分块文本**

**Step 5: Run e2e**

Run: `pnpm test:e2e -- --testPathPattern=files-query`
Expected: PASS

---

## Task 3: Files Manage e2e（回收站 + 重命名/移动）

**Files:**
- Create: `test/e2e/files-manage.e2e-spec.ts`

**Step 1: DELETE → 回收站列表可见**

**Step 2: POST restore → 根目录可见**

**Step 3: DELETE permanent → 404**

**Step 4: PUT rename / move**

**Step 5: POST batch/delete + batch/restore**

Run: `pnpm test:e2e -- --testPathPattern=files-manage`
Expected: PASS

---

## Task 4: 更新 MIGRATION.md

**Files:**
- Modify: `MIGRATION.md`

添加 S2 API 对照表与验收说明。

---

## Task 5: 全量回归 + 代码审查

**Step 1:** `pnpm build && pnpm test:e2e`

**Step 2:** 使用 `requesting-code-review` 对 S2 变更审查

**Step 3:** 修复 Critical/Important 问题

---

## S2 验收检查清单（设计文档 §S2）

- [x] 列表 e2e
- [x] 下载 e2e
- [x] txt 预览（text-chunk）e2e
- [x] 回收站 delete → restore → permanent e2e
- [x] 重命名 / 移动 e2e
- [x] 批量 delete / restore / move / permanent-delete e2e
- [x] thumbnail / batch download-zip e2e
- [x] 未认证 401 e2e
- [x] `pnpm build` + 全量 e2e 绿灯
- [x] MIGRATION.md 更新
- [x] 代码审查完成（修复 parentId=0 对齐 Express）

---

## 回退检查点

e2e 失败或前端文件页回归异常 → 前端 `.env` 改回 `http://localhost:3000`。
