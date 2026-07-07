# S6 Files 上传 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 8 个文件上传相关端点迁入 Nest，与 Express API 契约完全一致。

**Architecture:** 新建 `files/upload/` 子模块；`MergeUploadService` 承载 Express `mergeUpload.service.ts` 逻辑；Controller 薄封装 + multer options；`FilesUploadController` 在 module 中优先注册。

**Tech Stack:** NestJS 11、multer、jschardet、Prisma、Supertest

**设计文档：** [2026-07-07-s6-upload-design.md](./2026-07-07-s6-upload-design.md)

**Express 参照：**
- `../file_management_backend/src/controllers/file/upload.controller.ts`
- `../file_management_backend/src/services/mergeUpload.service.ts`
- `../file_management_backend/src/middleware/upload.middleware.ts`
- `../file_management_backend/src/controllers/file/query.controller.ts`（checkFileName）
- `../file_management_backend/src/controllers/file/manage.controller.ts`（createFolder）

---

## Task 1: MergeUploadService

**Files:**
- Create: `src/files/upload/merge-upload.service.ts`
- Create: `src/files/upload/merge-upload.errors.ts`（`MergeUploadError` 类）

**Step 1:** 从 Express 复制 `mergeUpload.service.ts` 全部导出函数为 `MergeUploadService` 方法：
- `assertValidMergeChunksBody`
- `mergeChunkFilesToDisk`
- `createEmptyMergedFileOnDisk`
- `refineMimeTypeForMergedFile`
- `persistMergedFileRecords`
- `cleanupChunksAfterMerge`
- `guessMimeFromFileName` / `resolveUniqueNameInFolder` / `registerLocalFileInDrive`（供 S7 解压复用）

**Step 2:** `prisma` → 注入 `PrismaService`；`@Injectable()`。

**Step 3:** `pnpm build` 通过。

---

## Task 2: Multer Options

**Files:**
- Create: `src/files/upload/chunk-upload.options.ts`
- Create: `src/files/upload/file-upload.options.ts`

**Step 1:** `chunk-upload.options.ts`：
- 临时目录：`join(process.cwd(), 'chunks', '_tmp')` 或 uploads 下 tmp
- `uploadChunk` 内再 `rename` 到 `chunks/<fileHash>/chunk-N`（与 Express 一致）
- 分片请求（body 含 `fileHash` + `chunkIndex`）跳过类型过滤

**Step 2:** `file-upload.options.ts`：
- 复制 Express `upload.middleware.ts` 的 `allowedTypes` 与 `MAX_FILE_SIZE`
- destination：`getUploadRootDir()` 或 Express 共用 `../file_management_backend/uploads`

**Step 3:** `pnpm build` 通过。

---

## Task 3: FilesUploadService + Controller

**Files:**
- Create: `src/files/upload/files-upload.service.ts`
- Create: `src/files/upload/files-upload.controller.ts`
- Modify: `src/files/files.module.ts`

**Step 1:** Service 方法对应 8 个端点，逻辑从 Express controller 逐方法搬入：
- `checkFileExists(userId, fileHash)`
- `checkFileName(userId, body)`
- `uploadChunk(user, file, body)`
- `getUploadedChunks(userId, fileHash)`
- `mergeChunks(req, user, body)`
- `instantUpload(req, user, body)`
- `uploadFile(req, user, file, parentId?)`
- `createFolder(req, user, name, parentId?)`

**Step 2:** Controller：
```typescript
@Controller('files')
export class FilesUploadController {
  @Post('check-exists') ...
  @Post('check-name') ...
  @Post('upload-chunk') @UseInterceptors(FileInterceptor('chunk', chunkUploadOptions)) ...
  @Get('chunks/:fileHash') ...
  @Post('merge-chunks') @HttpCode(201) ...
  @Post('instant-upload') @HttpCode(201) ...
  @Post('upload') @UseInterceptors(FileInterceptor('file', fileUploadOptions)) ...
  @Post('folder') @HttpCode(201) ...
}
```

**Step 3:** `files.module.ts` 将 `FilesUploadController` 放在 controllers 数组**第一位**；注册 `MergeUploadService`、`FilesUploadService`。

**Step 4:** `pnpm build` 通过。

---

## Task 4: E2E 测试

**Files:**
- Create: `test/e2e/files-upload.e2e-spec.ts`
- Modify: `test/helpers/files.helper.ts`（可选：添加 `computeMd5` helper）

**Step 1:** 401 无 token 用例（check-exists）

**Step 2:** check-exists / check-name 契约用例

**Step 3:** 分片上传全链路：
- 写入 1 个 chunk → GET chunks → merge-chunks → GET /files 含新文件

**Step 4:** POST /files/upload 小文件

**Step 5:** POST /files/folder 成功 + 重名 400

**Step 6:** 运行 `pnpm test:e2e`，预期全绿。

---

## Task 5: MIGRATION.md

**Files:**
- Modify: `MIGRATION.md`

添加 S6 端点对照表、验收说明、测试说明；阶段进度表增加 S6 ✅。

---

## 验收清单

- [ ] `pnpm exec eslint "{src,test}/**/*.ts"` 零错误
- [ ] `pnpm build`
- [ ] `pnpm test:e2e` 全绿（含 files-upload）
- [ ] check-name 响应为 `{ success, exists }` 无 `data` 嵌套
- [ ] 分片目录与 Express 共用 `chunks/<hash>/`
- [ ] 手测前端上传 + 新建文件夹（可选，用户执行）
