# Skills 快速参考

## 🚀 快速开始

### 启动开发环境
```bash
# 后端
cd file_management_backend && npm run dev

# 前端
cd file_management_frontend && npm run dev
```

### 创建管理员
```bash
cd file_management_backend
npx tsx scripts/create-admin.ts
```

### 数据库迁移
```bash
cd file_management_backend

# 备份数据（重要！）
npx tsx scripts/backup-db.ts

# 安全迁移（创建但不应用）
npx prisma migrate dev --create-only --name migration_name

# 检查迁移 SQL 后应用
npx prisma migrate dev

# 或使用 db push（保留数据）
npx prisma db push
```


## 📚 可用 Skills

| Skill | 用途 | 快速命令 |
|-------|------|---------|
| **database-migration** | 数据库迁移 | `npx prisma migrate dev` |
| **dev-server** | 启动开发服务器 | `npm run dev` |
| **user-management** | 用户管理 | `npx tsx scripts/create-admin.ts` |

## 🔗 快速链接

- [Skills 完整文档](README.md)
- [数据库迁移助手](database-migration/SKILL.md)
- [开发环境启动助手](dev-server/SKILL.md)
- [用户管理助手](user-management/SKILL.md)

## 💡 使用提示

向 AI 助手说：
- "帮我启动开发服务器" → 使用 dev-server skill
- "创建数据库迁移" → 使用 database-migration skill
- "创建管理员账户" → 使用 user-management skill

## 🛠️ 常用工具

```bash
# Prisma Studio（数据库可视化）
npx prisma studio

# 检查迁移状态
npx prisma migrate status

# 查看管理员账户
npx tsx scripts/check-admin.ts
```
