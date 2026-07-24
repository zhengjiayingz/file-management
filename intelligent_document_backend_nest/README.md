# 网盘后端 Nest 迁移版

Express → Nest 迁移已完成，**Nest 为唯一运行后端**，默认端口 **3000**（Express 已归档）。

## 快速开始

```bash
# 复制环境变量（与 Express 共用 DATABASE_URL、JWT_SECRET）
cp .env.example .env

pnpm install
pnpm prisma:generate   # schema 变更后需重新 generate
pnpm start:dev
```

- 健康检查：`GET http://localhost:3000/health`
- Swagger：`GET http://localhost:3000/api-docs`
- 登录：`POST http://localhost:3000/api/auth/login`
- 资料：`GET http://localhost:3000/api/user/profile`（需 Bearer Token）

## 目录说明

| 路径 | 说明 |
|------|------|
| `src/auth/` | 认证（已从 Express 迁移核心逻辑） |
| `src/user/` | 用户资料 |
| `src/prisma/` | Prisma 全局模块 |
| `prisma/schema.prisma` | 从 Express 复制，需手动同步 |
| `MIGRATION.md` | 迁移路线图 |

## Prisma 同步

Express 侧 `schema.prisma` 有更新时：

```powershell
Copy-Item ..\intelligent_document_backend\prisma\schema.prisma .\prisma\schema.prisma -Force
pnpm prisma:generate
```

详见 [MIGRATION.md](./MIGRATION.md)。
