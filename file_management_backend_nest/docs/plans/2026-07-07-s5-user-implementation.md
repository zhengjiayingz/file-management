# S5 User + UserPreference Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 User 剩余端点与 UserPreference 迁入 Nest，与 Express 响应格式一致。

**Architecture:** 扩展 `user/` 模块（profile PUT、avatar POST、search GET）；新建 `user-preference/` 模块；头像使用 `FileInterceptor` + 磁盘存储至 Express 共用 `uploads/avatars`。

**Tech Stack:** NestJS 11、multer、class-validator、Supertest

**设计文档：** [2026-07-06-nest-migration-design.md](./2026-07-06-nest-migration-design.md) §S5

**Express 参照：**
- `../file_management_backend/src/controllers/user.controller.ts`
- `../file_management_backend/src/controllers/user-preference.controller.ts`
- `../file_management_backend/src/middleware/avatarUpload.middleware.ts`

---

## 端点范围

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/user/profile` | GET | ✅ 已有，修正 `mfa_setup_pending` |
| `/api/user/profile` | PUT | 更新邮箱 |
| `/api/user/avatar` | POST | multipart `avatar` |
| `/api/user/search` | GET | `?keyword=` |
| `/api/user-preferences` | GET/PUT | 语言/主题 |

---

## Task 1: User Service 扩展

**Files:**
- Create: `src/common/utils/email.util.ts`
- Create: `src/user/dto/update-profile.dto.ts`
- Create: `src/user/utils/avatar-upload.options.ts`
- Modify: `src/user/services/user.service.ts`
- Modify: `src/user/controllers/user.controller.ts`

---

## Task 2: UserPreference 模块

**Files:**
- Create: `src/user-preference/dto/update-user-preference.dto.ts`
- Create: `src/user-preference/services/user-preference.service.ts`
- Create: `src/user-preference/controllers/user-preference.controller.ts`
- Create: `src/user-preference/user-preference.module.ts`
- Modify: `src/app.module.ts`

---

## Task 3: E2E

**Files:**
- Create: `test/e2e/user.e2e-spec.ts`
- Create: `test/e2e/user-preference.e2e-spec.ts`

---

## Task 4: MIGRATION.md

---

## 验收清单

- [ ] `pnpm build`
- [ ] `pnpm test:e2e` 全绿
- [ ] profile 返回 `mfa_setup_pending`
- [ ] 头像路径 `/uploads/avatars/...` 与 Express 共用
