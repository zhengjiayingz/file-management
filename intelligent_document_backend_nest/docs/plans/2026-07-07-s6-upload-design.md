# S6 Files 上传 — 设计文档

> 日期：2026-07-07  
> 状态：已评审（基于迁移总设计 + Express 源码对照）

## 目标

将 Express `upload.controller.ts`、`mergeUpload.service.ts`、`upload.middleware.ts` 及 `createFolder` / `checkFileName` 迁入 Nest，使前端上传全链路（秒传预检、分片、合并、传统上传、建文件夹）可在 **3002** 端口验收。

## 端点范围（8 个）

| 端点 | 方法 | Express 来源 | 响应要点 |
|------|------|-------------|----------|
| `/api/files/check-exists` | POST | `upload.controller` | `{ success, data: { exists, fileInfo? } }` |
| `/api/files/check-name` | POST | `query.controller` | `{ success, exists }` **无 data 包装** |
| `/api/files/upload-chunk` | POST | `upload.controller` | multipart `chunk` |
| `/api/files/chunks/:fileHash` | GET | `upload.controller` | `{ success, data: number[] }` |
| `/api/files/merge-chunks` | POST | `upload.controller` | 201 + `data: FileItem` |
| `/api/files/instant-upload` | POST | `upload.controller` | 201 + `data: FileItem` |
| `/api/files/upload` | POST | `upload.controller` | multipart `file` |
| `/api/files/folder` | POST | `manage.controller` | body `{ name, parentId }` |

## 架构

### 模块布局（遵循 nest-backend-conventions）

```
src/files/upload/
  files-upload.controller.ts    # 薄路由层
  files-upload.service.ts       # 编排：check / chunk / merge / instant / upload / folder
  merge-upload.service.ts       # 从 Express 搬：合并、落库、清理、MIME 探测
  chunk-upload.options.ts       # multer：分片临时目录
  file-upload.options.ts        # multer：传统上传（类型过滤 + MAX_FILE_SIZE）
  dto/                          # 按需 class-validator（merge body 仍走 service 校验）
```

`FilesUploadController` 在 `files.module.ts` 中**最先**注册（静态路由 `check-exists`、`chunks/:fileHash` 等优先于 `:id`）。

### 核心策略

1. **Service 原样搬，不重写** — `mergeUpload.service.ts` 逻辑整体迁入 `MergeUploadService`（Injectable），仅将 `prisma` 换为 `PrismaService`。
2. **共用存储路径** — `getUploadRootDir()`、`toStoredRelativePath()` 已有；分片目录仍为 `process.cwd()/chunks/<fileHash>`，与 Express 一致。
3. **StorageProvider** — 传统 `upload` 走已有 `StorageService.getStorageProvider().putFromLocalFile()`。
4. **操作日志** — 复用 `OperationLogService`，上传成功写 `UPLOAD`。
5. **冲突策略** — `conflictAction === 'version'` 时写 `file_history` 并升版本，与 Express 一致。

### 数据流（分片上传）

```
前端 check-exists → upload-chunk × N → merge-chunks
                      ↓
              chunks/<hash>/chunk-N
                      ↓
         mergeChunkFilesToDisk → persistMergedFileRecords
                      ↓
              cleanupChunksAfterMerge → 201
```

### 错误处理

- `MergeUploadError` → 对应 statusCode（多为 400）
- multer 类型拒绝 → 400「不支持的文件类型」
- 其余 → 500 + 与 Express 相同的中文 message

## 不在本阶段范围

- Tags / Versions / Archive（S7）
- 解压 `registerLocalFileInDrive` 仅随 merge-upload 搬入 service 文件，本阶段不暴露新端点

## 测试策略

新建 `test/e2e/files-upload.e2e-spec.ts`：

| 用例 | 说明 |
|------|------|
| check-exists 400/200 | 缺 hash；不存在 / 已存在（seed FileStorage） |
| check-name | `{ exists: false }` 顶层字段 |
| upload-chunk + get chunks + merge-chunks | 小文件 1 片合并，校验 201 与列表可查 |
| instant-upload 404 | 无 FileStorage |
| upload 单文件 | multipart 传统上传 |
| folder 201 / 400 重名 | 创建文件夹 |

使用 MD5 `calculateFileHash`（与 Express 一致），非 e2e helper 里的 sha256 seed。

## 验收

- `pnpm build` + `pnpm test:e2e` 全绿
- 前端 `VITE_API_BASE_URL=http://localhost:3002` 手测：拖拽上传、大文件分片、秒传、新建文件夹
- 更新 `MIGRATION.md` S6 段落

## 回退

上传链路异常时前端改回 `VITE_API_BASE_URL=http://localhost:3000`。
