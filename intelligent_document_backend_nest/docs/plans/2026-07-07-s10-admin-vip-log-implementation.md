# S10 Admin + VIP + Log Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 迁入 Admin 9 + VIP 8 + Log 1 端点，VIP 申请补齐 `message:new` Socket 推送。

**Architecture:** 三个 Nest Module；`RolesGuard` + `@Roles('admin')`；OperationLog 拆 query service；复用 `PasswordPolicyService`、`AdminFriendService`、`RealtimeEmitterService`。

**Tech Stack:** NestJS 11、Prisma、现有 Guards

**设计文档：** [2026-07-07-s10-admin-vip-log-design.md](./2026-07-07-s10-admin-vip-log-design.md)

---

## Task 1: TDD RED — e2e 骨架

**Files:**
- Create: `test/helpers/admin.helper.ts`
- Create: `test/e2e/admin.e2e-spec.ts`
- Create: `test/e2e/vip.e2e-spec.ts`
- Create: `test/e2e/log.e2e-spec.ts`

**Step 1:** 写失败用例（404/403）
**Step 2:** `pnpm test:e2e test/e2e/admin.e2e-spec.ts` 确认 RED

---

## Task 2: OperationLogModule + GET /logs

**Files:**
- Create: `src/operation-log/operation-log-query.service.ts`
- Create: `src/operation-log/operation-log.controller.ts`
- Create: `src/operation-log/operation-log.module.ts`
- Modify: `src/files/files.module.ts`（改 import OperationLogModule）
- Modify: `src/app.module.ts`

端口 Express `log.controller.ts` 全部筛选逻辑。

---

## Task 3: Admin 模块

**Files:**
- Create: `src/admin/admin.service.ts`
- Create: `src/admin/admin.controller.ts`
- Create: `src/admin/admin.module.ts`
- Modify: `src/common/password-policy/password-policy.service.ts`（`parseAdminRequiredCategories`、`ADMIN_TEMP_RESET_PASSWORD`）

---

## Task 4: VIP 模块 + Socket

**Files:**
- Create: `src/vip/vip.service.ts`
- Create: `src/vip/vip.controller.ts`
- Create: `src/vip/vip.module.ts`

`apply` 调用 `notifyAdminsVipApply` → Message + `emitToUser`。

---

## Task 5: e2e GREEN + 文档

- Modify: `MIGRATION.md`
- Modify: `docs/plans/2026-07-06-nest-migration-design.md`

```bash
pnpm build
pnpm test:e2e
```

Expected: 20 suites / 110 tests，0 failures ✅
