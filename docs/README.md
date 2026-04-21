# 文档索引

> **最后整理**：2026-04-21。安全相关验收口径（§5(2) Token 强失效：`session_version`/`sv` + Refresh 撤销，**不**做逐枚 Access 黑名单）以 [REQUIREMENTS.md](./REQUIREMENTS.md) 为准；**并发会话**（普通 2 / VIP 5 / 管理员不限）、登录 **409** `SESSION_LIMIT` 与 **`revokeSessionId`** 踢设备见 [REQUIREMENTS.md](./REQUIREMENTS.md) §1(8)、[BUSINESS_FLOWS.md](./BUSINESS_FLOWS.md) §1.2。库表字段见 [DATABASE_DESIGN.md](./DATABASE_DESIGN.md)。链接分享 **访问人数上限**（`max_visitors`）与 `ShareAccessLog`（含 `save`）见 [REQUIREMENTS.md](./REQUIREMENTS.md) 实现状态总览 §3、[BUSINESS_FLOWS.md](./BUSINESS_FLOWS.md) §3。

| 文档 | 说明 |
|------|------|
| [REQUIREMENTS.md](./REQUIREMENTS.md) | 产品需求与实现状态总览 |
| [UNFINISHED_REQUIREMENTS.md](./UNFINISHED_REQUIREMENTS.md) | 未完成 / 部分完成清单 |
| [PROGRESS_REPORT.md](./PROGRESS_REPORT.md) | 按需求章节的进度对照与统计 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | **本地开发**：Prisma `generate`、`postinstall`/`build`、Windows EPERM、TS/IDE |
| [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) | 数据库表结构与字段（对齐 `schema.prisma`） |
| [BUSINESS_FLOWS.md](./BUSINESS_FLOWS.md) | 业务流程与表操作说明 |
| [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) | Swagger 使用说明与常见问题 |
