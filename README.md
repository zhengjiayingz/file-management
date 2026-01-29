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
- **认证**: JWT (双 Token 机制)
- **文件上传**: Multer

## 📖 文档

- [📋 需求文档](./docs/REQUIREMENTS.md) - 详细的功能需求和技术规格
- [🔌 API 文档指南](./docs/API_DOCUMENTATION.md) - Swagger 访问和开发指南
- [🗄️ 数据库设计](./docs/DATABASE_DESIGN.md) - 数据库结构和关系设计
- [🔄 业务流程](./docs/BUSINESS_FLOWS.md) - 详细的业务逻辑和数据流

## 🔐 默认账户

- **管理员**: `admin` / `Admin@123`
- **测试用户**: `test` / `Test@123`

## 🤝 开发规范与 Skills

项目使用 **Cursor Skills** 来管理开发规范和最佳实践。请查阅 `.agent/skills/` 目录：

- [API 文档助手](./.agent/skills/api-documentation/SKILL.md) (Swagger 注释)
- [前端开发助手](./.agent/skills/frontend-development/SKILL.md) (Vue/TS 规范)
- [数据库迁移助手](./.agent/skills/database-migration/SKILL.md)
- [开发环境启动助手](./.agent/skills/dev-server/SKILL.md)

请参考 [Skills 概览](./.agent/skills/README.md) 了解更多。

## 🚧 开发状态

- ✅ 用户认证系统 (登录/注册/JWT)
- ✅ 数据库设计和 ORM 集成
- ✅ 文件上传（分片、秒传）
- ✅ 文件管理（基本操作、回收站）
- ✅ 系统日志管理
- ✅ 国际化与主题设置
- 🚧 文件分享功能
- 🚧 预览功能支持
- 🚧 管理员面板 (部分完成)

## 📄 许可证

MIT License