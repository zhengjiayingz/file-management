# S7 Tags + Versions + Archive Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 补全 Versions/Archive 迁入 Nest；Tags 补 e2e。

**Architecture:** `files/version/`、`files/archive/`；Archive 依赖 `yauzl` + `MergeUploadService`。

**设计文档：** [2026-07-07-s7-versions-archive-design.md](./2026-07-07-s7-versions-archive-design.md)

**Express 参照：**
- `../file_management_backend/src/controllers/file/version.controller.ts`
- `../file_management_backend/src/controllers/file/archiveExtract.controller.ts`

---

## Task 1: 依赖 yauzl

`pnpm add yauzl` + `pnpm add -D @types/yauzl`

---

## Task 2: FilesVersionService + Controller

**Files:**
- Create: `src/files/version/files-version.service.ts`
- Create: `src/files/version/files-version.controller.ts`

端点：`GET :id/versions`、`POST :id/versions/:versionId/rollback`、`GET :id/versions/:versionId/download`

---

## Task 3: FilesArchiveService + Controller

**Files:**
- Create: `src/files/archive/files-archive.service.ts`
- Create: `src/files/archive/files-archive.controller.ts`

从 Express `archiveExtract.controller.ts` 搬入；注入 `MergeUploadService`。

---

## Task 4: files.module.ts 注册

Version/Archive Controller 置于 Query 之前。

---

## Task 5: E2E

- Create: `test/e2e/files-tag.e2e-spec.ts`
- Create: `test/e2e/files-version.e2e-spec.ts`
- Create: `test/e2e/files-archive.e2e-spec.ts`
- Modify: `test/helpers/files.helper.ts`（seedZipFile、seedFileHistory）

---

## Task 6: MIGRATION.md + 设计文档进度
