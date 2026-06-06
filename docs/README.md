# 文档索引

> **最后整理**：2026-04-24。§2(17) 文档类预览（Word/PPT/PDF/文本等）与 [REQUIREMENTS.md](./REQUIREMENTS.md) §2(17)、[PROGRESS_REPORT.md](./PROGRESS_REPORT.md) 二、(17) 已对齐。安全相关验收口径（§5(2) Token 强失效：`session_version`/`sv` + Refresh 撤销，**不**做逐枚 Access 黑名单）以 [REQUIREMENTS.md](./REQUIREMENTS.md) 为准；**管理员可选 TOTP 两步验证**见 §5(8) 与 [BUSINESS_FLOWS.md](./BUSINESS_FLOWS.md) §1.2.1、§9.4、迁移 `20260422120000_add_user_totp`。**并发会话**（普通 2 / VIP 5 / 管理员不限）、登录 **409** `SESSION_LIMIT` 与 **`revokeSessionId`** 踢设备见 [REQUIREMENTS.md](./REQUIREMENTS.md) §1(8)、[BUSINESS_FLOWS.md](./BUSINESS_FLOWS.md) §1.2；若已开 TOTP，第二步 **`mfa/verify`** 可同带 `revokeSessionId`（见 [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) 常见问题）。**全局策略与默认配额**（密码强度、各角色默认存储、标签个数上限）见 **`system_settings`** — [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) §3.17、[BUSINESS_FLOWS.md](./BUSINESS_FLOWS.md) §7.4。链接分享 **访问人数上限**（`max_visitors`）与 `ShareAccessLog`（含 `save`）见 [REQUIREMENTS.md](./REQUIREMENTS.md) 实现状态总览 §3、[BUSINESS_FLOWS.md](./BUSINESS_FLOWS.md) §3。

| 文档 | 说明 |
|------|------|
| [REQUIREMENTS.md](./REQUIREMENTS.md) | 产品需求与实现状态总览 |
| [UNFINISHED_REQUIREMENTS.md](./UNFINISHED_REQUIREMENTS.md) | 未完成 / 部分完成清单 |
| [PROGRESS_REPORT.md](./PROGRESS_REPORT.md) | 按需求章节的进度对照与统计 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | **本地开发**：Prisma `generate`、`postinstall`/`build`、Windows EPERM、TS/IDE |
| [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) | 数据库表结构与字段（对齐 `schema.prisma`） |
| [BUSINESS_FLOWS.md](./BUSINESS_FLOWS.md) | 业务流程与表操作说明 |
| [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) | Swagger 使用说明与常见问题 |
| [REDIS_INTERVIEW_QA.md](./REDIS_INTERVIEW_QA.md) | **面试**：Redis 概念、场景、常见用法与本项目结合 |
| [WEBSOCKET_SOCKET_INTERVIEW_QA.md](./WEBSOCKET_SOCKET_INTERVIEW_QA.md) | **面试**：WebSocket / Socket.IO 常见问题 |
| [NODE_BACKEND_STRENGTHENING.md](./NODE_BACKEND_STRENGTHENING.md) | Node 后端工程补强总纲 |
| [NODE_BACKEND_实施任务清单.md](./NODE_BACKEND_实施任务清单.md) | 补强实施任务清单（按阶段勾选） |
| [notes/SOCKET_MULTI_INSTANCE.md](./notes/SOCKET_MULTI_INSTANCE.md) | **阶段二 2.3**：Socket.IO Redis Adapter 多实例广播说明与本地验收 |
