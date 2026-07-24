# S11 收尾与 Express 下线 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Nest 独占 3000 端口，迁入 Swagger / 定时清理 / Preview Worker，Express 归档。

**Architecture:** JobsModule + PreviewProcessor + worker.main.ts；docker-compose 指向 Nest。

**设计文档：** [2026-07-08-s11-shutdown-design.md](./2026-07-08-s11-shutdown-design.md)

---

## Task 1: 依赖

```bash
pnpm add @nestjs/swagger @nestjs/schedule @nestjs/bullmq
```

---

## Task 2: TDD — cleanup 单元测试 + 实现

**Files:**
- Create: `src/jobs/cleanup-tasks.service.ts`
- Create: `src/jobs/jobs.module.ts`
- Create: `src/jobs/cleanup-tasks.service.spec.ts`

RED → GREEN：`runCleanupOnce()` 删除 pending_delete 文件与过期 share。

---

## Task 3: Preview Processor

**Files:**
- Modify: `src/files/preview/files-preview.service.ts` — `processPreviewConvertJob`、`shouldDeferFullConversion`
- Create: `src/files/preview/preview.processor.ts`
- Create: `src/worker.main.ts`
- Modify: `src/files/files.module.ts`、`src/app.module.ts`

---

## Task 4: Swagger

**Files:** Modify `src/main.ts` — `DocumentBuilder`，`/api-docs`  
**Test:** `test/e2e/swagger.e2e-spec.ts` — GET `/api-docs` 200

---

## Task 5: 端口与 Docker

**Files:**
- Modify: `.env.example`、`src/main.ts` 默认 PORT 3000
- Create: `Dockerfile`、`docker-compose.yml`
- Modify: `../file_management_backend/README.md` DEPRECATED

---

## Task 6: 文档与 Prisma 权威

- Modify: `MIGRATION.md`、`docs/plans/2026-07-06-nest-migration-design.md`
- Modify: `../file_management_backend/prisma/schema.prisma` 顶部注释指向 Nest

---

## Task 7: 全量验证

```bash
pnpm build
pnpm test:e2e
```

Expected: 21 suites / 111+ tests，0 failures
