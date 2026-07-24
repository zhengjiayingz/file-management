# Prisma Schema

本目录的 `schema.prisma` 从 `../file_management_backend/prisma/schema.prisma` 复制而来，**共用同一 MySQL 数据库**。

迁移 Express 后端时，若 Express 侧 schema 有变更，请同步复制后再执行：

```bash
pnpm prisma:generate
```
