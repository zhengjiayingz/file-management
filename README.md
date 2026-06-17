# 文件管理系统

一个基于 Vue 3 + Node.js + MySQL 的现代化文件管理系统。

## 🚀 快速开始

### 环境要求
- Node.js 18+
- MySQL 8.0+
- pnpm (推荐) 或 npm

### 安装和运行

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd FileManagement_proj
   ```

2. **安装依赖**
   ```bash
   # 后端
   cd file_management_backend
   pnpm install
   
   # 前端
   cd ../file_management_frontend
   pnpm install
   ```

3. **配置数据库**
   ```bash
   # 复制环境变量文件
   cd ../file_management_backend
   cp .env.example .env
   
   # 编辑 .env 文件，配置数据库连接
   # 同步数据库结构
   pnpm prisma:db:push
   ```

4. **启动服务**
   ```bash
   # 启动后端 (端口 3000)
   cd file_management_backend
   pnpm dev
   
   # 启动前端 (端口 5173)
   cd ../file_management_frontend
   pnpm dev
   ```

5. **访问应用**
   - 前端：http://localhost:5173
   - 后端 API：http://localhost:3000

## 📁 项目结构

```
FileManagement_proj/
├── docs/                          # 📚 项目文档
│   ├── REQUIREMENTS.md            # 需求文档
│   ├── DATABASE_DESIGN.md         # 数据库设计
│   └── BUSINESS_FLOWS.md          # 业务流程
├── file_management_backend/       # 🔧 后端服务
│   ├── src/                       # 源代码
│   ├── prisma/                    # 数据库模型
│   ├── README.md                  # 后端说明
│   └── QUICK_START.md             # 快速开始
└── file_management_frontend/      # 🎨 前端应用
    ├── src/                       # 源代码
    └── README.md                  # 前端说明
```

## 🛠️ 技术栈

### 前端
- **框架**: Vue 3 + TypeScript
- **构建工具**: Vite
- **UI 组件**: Element Plus
- **状态管理**: Pinia
- **路由**: Vue Router

### 后端
- **运行时**: Node.js + TypeScript
- **框架**: Express.js
- **数据库**: MySQL + Prisma ORM
- **缓存/限流**: Redis
- **认证**: JWT (双 Token 机制)
- **实时通讯**: Socket.IO
- **任务队列**: BullMQ（Office 预览转码 Worker）
- **文件上传**: Multer
- **对象存储**: StorageProvider（本地 / MinIO）
- **部署**: Docker Compose（API + Worker + Redis）

## 📖 文档

- [📋 需求文档](./docs/REQUIREMENTS.md) - 详细的功能需求和技术规格
- [🔌 API 文档指南](./docs/API_DOCUMENTATION.md) - Swagger 访问和开发指南
- [🗄️ 数据库设计](./docs/DATABASE_DESIGN.md) - 数据库结构和关系设计
- [🔄 业务流程](./docs/BUSINESS_FLOWS.md) - 详细的业务逻辑和数据流
- [📊 实现进度报告](./docs/PROGRESS_REPORT.md) - 按需求条目的完成度对照

## 🔐 初始账户

在 `file_management_backend` 目录配置好 `.env` 后，可用脚本创建管理员（密码通过环境变量 `ADMIN_PASSWORD` 传入，勿写入仓库）：

```bash
cd file_management_backend
pnpm exec tsx scripts/create-admin.ts
```

详见 [`.env.example`](./file_management_backend/.env.example)。

## 🤝 开发规范与 Skills

项目使用 **Cursor Skills** 来管理开发规范和最佳实践。请查阅 `.agent/skills/` 目录：

- [API 文档助手](./.agent/skills/api-documentation/SKILL.md) (Swagger 注释)
- [前端开发助手](./.agent/skills/frontend-development/SKILL.md) (Vue/TS 规范)
- [数据库迁移助手](./.agent/skills/database-migration/SKILL.md)
- [开发环境启动助手](./.agent/skills/dev-server/SKILL.md)

请参考 [Skills 概览](./.agent/skills/README.md) 了解更多。

## ✅ 已实现功能

### 用户与权限
- 注册/登录、双 Token 无感刷新与登出
- 密码强度策略、管理员重置密码、强制改密与自助改密
- 普通 / VIP / 管理员角色与存储配额
- VIP 申请与管理员审核
- 好友系统、私信聊天（Socket.IO 实时推送）
- 并发会话管理（达限踢设备、顶栏会话管理）
- 管理员可选 TOTP 两步验证

### 文件管理
- 分片上传、断点续传、秒传、拖拽上传与上传队列
- 文件夹创建、移动、重命名、搜索与排序
- 批量下载/删除/移动、回收站与智能还原
- 文件版本历史、标签分类、缩略图
- 在线预览（图片、视频、Office/PPT/PDF、文本分块等）
- ZIP 在线解压、无引用文件定时清理

### 文件分享
- 公开/私密分享链接、有效期与提取码
- 访问人数上限、我的分享与访问记录
- 访客预览、下载与转存

### 安全与日志
- 登录日志、操作日志
- API 与登录限流（Redis）
- Token 刷新撤销与 `session_version` 强失效

### 管理员
- 用户列表、禁用/启用
- 存储统计看板（总量与排行）
- 系统设置（密码策略、各角色默认配额、标签上限）

### 体验与其他
- 主题切换（浅色/深色）、国际化（简中/繁中/英文）
- 个人信息与设置（头像、邮箱、改密）
- Swagger API 文档
- Docker Compose 部署、本地/MinIO 存储切换
- k6 登录压测脚本（`scripts/load/login.k6.js`）与[性能笔记](./docs/PERFORMANCE_NOTES.md)

## 📄 许可证

MIT License