# File Management Backend

基于 Node.js + Express + TypeScript + Prisma 的文件管理系统后端。

## 📁 目录结构

请参考 [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)

## 🚀 快速启动

详细启动指南请参考根目录的开发环境助手：
`.agent/skills/dev-server/SKILL.md`

或者简单运行：
```bash
# 安装依赖
pnpm install

# 数据库迁移
pnpm prisma:db:push

# 启动开发服务器
pnpm dev
```

## 📡 API 文档

本项目使用 Swagger UI 作为 API 文档。
启动服务器后访问：**http://localhost:3000/api-docs**

## 🛠️ 技术栈

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: MySQL 8.0+
- **ORM**: Prisma
- **Auth**: JWT (AccessToken + RefreshToken)
- **Upload**: Multer + Stream (支持分片上传)

## 📝 核心功能

1. **用户认证**: 注册、登录、Token 刷新
2. **文件管理**: 上传（普通/分片/秒传）、下载、删除、重命名
3. **回收站**: 软删除、还原、彻底删除
4. **日志系统**: 全局操作日志记录

## ⚠️ 注意事项

- **数据库**: 请确保 `.env` 中的 `DATABASE_URL` 配置正确。
- **上传目录**: 默认上传到根目录下的 `uploads/`，请确保有写入权限。
