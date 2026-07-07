# S7 Tags + Versions + Archive — 设计文档

> 日期：2026-07-07  
> 状态：已评审

## 目标

完成 Files 域剩余子模块：**Tags e2e 补全**（代码已迁）、**Versions**（3 端点）、**Archive 在线解压**（3 端点）。

## 端点范围

| 端点 | 方法 | 状态 |
|------|------|------|
| `/api/files/tags` | GET/POST | ✅ `files/tag/` |
| `/api/files/tags/:tagId` | PUT/DELETE | ✅ |
| `/api/files/:id/tags` | PUT | ✅ |
| `/api/files/:id/versions` | GET | ⬜ |
| `/api/files/:id/versions/:versionId/rollback` | POST | ⬜ |
| `/api/files/:id/versions/:versionId/download` | GET | ⬜ |
| `/api/files/:id/archive/entries` | GET | ⬜ VIP/管理员 |
| `/api/files/:id/archive/conflicts` | POST | ⬜ |
| `/api/files/:id/archive/extract` | POST | ⬜ |

## 架构

```
files/
  tag/          # ✅ 已有
  version/      # files-version.controller + service
  archive/      # files-archive.controller + service（yauzl）
```

`FilesVersionController`、`FilesArchiveController` 在 `files.module.ts` 中注册于 `FilesQueryController`（含 `GET :id`）**之前**。

Archive 解压落盘复用 `MergeUploadService.registerLocalFileInDrive()`（S6 已迁）。

## 权限

在线解压：`role === 'admin'` 或有效 VIP（`vipExpireAt` 未过期或为空），与 Express `userCanExtractArchive` 一致。

## 测试

- `test/e2e/files-tag.e2e-spec.ts` — 标签 CRUD + setFileTags
- `test/e2e/files-version.e2e-spec.ts` — 列表、回滚、下载
- `test/e2e/files-archive.e2e-spec.ts` — 403 普通用户、admin 列条目

## 验收

`pnpm build` + `pnpm test:e2e` 全绿；更新 `MIGRATION.md`。
