# S10 Admin + VIP + Log — 设计文档

> 日期：2026-07-07  
> 状态：已评审（与 Express 行为对齐）

## 目标

迁入管理后台、VIP 审核、操作日志查询共 **18 个 REST 端点**（Admin 9 + VIP 8 + Log 1），补齐 S9 留空的 VIP 申请 Socket 推送。

## 端点清单

### Admin（`/api/admin`，全部 `@Roles('admin')`）

| 方法 | 路径 | Express 函数 |
|------|------|--------------|
| GET | `/dashboard` | `getDashboardStats` |
| GET | `/system-settings` | `getAdminSystemSettings` |
| PUT | `/system-settings` | `updateAdminSystemSettings` |
| POST | `/sync-friendships` | `syncFriendshipsWithAdmin` |
| GET | `/users` | `listUsers` |
| PATCH | `/users/:id/status` | `updateUserStatus` |
| POST | `/users/:id/reset-password` | `resetUserPassword` |
| POST | `/users/:id/kick-sessions` | `kickUserSessions` |
| POST | `/users/:id/clear-session-kick-marker` | `clearUserSessionKickMarker` |

### VIP（`/api/vip`）

| 方法 | 路径 | 权限 |
|------|------|------|
| GET | `/tier-config` | 登录用户 |
| POST | `/apply` | 登录用户 |
| GET | `/my-status` | 登录用户 |
| GET | `/pending` | admin |
| POST | `/requests/:id/approve` | admin |
| POST | `/requests/:id/reject` | admin |
| POST | `/applicant/:applicantId/approve` | admin |
| POST | `/applicant/:applicantId/reject` | admin |

### Log（`/api/logs`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 普通用户仅看自己；admin 可看全部或 `targetUserId`；支持 `transferOnly` 等筛选 |

## 架构

```
src/admin/
  admin.controller.ts    # @Controller('admin') + RolesGuard + @Roles('admin')
  admin.service.ts       # 仪表盘、用户管理、系统设置（复用 PasswordPolicyService、AdminFriendService）
  admin.module.ts

src/vip/
  vip.controller.ts      # 混合权限：admin 端点 @Roles('admin')
  vip.service.ts         # 申请/审核；notifyAdmins → Message + RealtimeEmitterService
  vip.module.ts

src/operation-log/
  operation-log.service.ts       # 已有 logOperation
  operation-log-query.service.ts # GET /logs 复杂 where 构建（对齐 Express log.controller）
  operation-log.controller.ts    # @Controller('logs')
  operation-log.module.ts
```

- **鉴权**：全局 `JwtAuthGuard`；Admin 控制器类级 `@UseGuards(RolesGuard) @Roles('admin')`；VIP 单端点级 `@Roles('admin')`。
- **系统设置**：`PasswordPolicyService.getSystemSettings()` 已存在；Admin 更新逻辑端口自 Express `admin.controller`。
- **临时重置密码**：常量 `ADMIN_TEMP_RESET_PASSWORD = '111111'`（与 Express 一致）。
- **好友补全**：`AdminFriendService.ensureFriendshipWithAdmin` 已存在，供 `sync-friendships` 复用。

## VIP Socket 推送（S9 留空项）

`POST /api/vip/apply` 成功后：

1. 向每位活跃 admin 创建一条系统通知消息（`messageType: text`）
2. `RealtimeEmitterService.emitToUser(adminId, 'message:new', { message })`

与 Express `notifyAdminsVipApply` 一致。

## 非目标

- Auth 注册时给 admin 发通知（Express `auth.controller`，可 S11 或按需补）
- Swagger 文档（S11）

## 验收

1. **e2e**：`admin.e2e-spec.ts`、`vip.e2e-spec.ts`、`log.e2e-spec.ts` 覆盖 403/200 主路径
2. **手测**：管理后台仪表盘、禁用用户、VIP 申请与审核、传输记录页
3. `pnpm build` + `pnpm test:e2e` 全绿

## Express 参照

- `../file_management_backend/src/controllers/admin.controller.ts`
- `../file_management_backend/src/controllers/vip.controller.ts`
- `../file_management_backend/src/controllers/log.controller.ts`
