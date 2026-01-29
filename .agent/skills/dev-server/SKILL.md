---
name: 开发环境启动助手
description: 快速启动和管理前后端开发服务器
---

# 开发环境启动助手

## 概述
这个技能帮助你快速启动文件管理系统的开发环境，包括前端 Vue 应用和后端 Express 服务器。

## 使用场景
- 开始开发工作时启动开发服务器
- 需要同时运行前后端进行调试
- 重启服务器以应用配置更改
- 检查服务器运行状态

## 前置条件
- 已安装 Node.js 和 npm
- 已在前后端目录分别执行 `npm install`
- 已配置后端 `.env` 文件
- 数据库已启动并可访问

## 执行步骤

### 方式一：分别启动（推荐用于开发调试）

#### 1. 启动后端服务器
在第一个终端窗口：
```bash
cd file_management_backend
npm run dev
```

后端服务器默认运行在：`http://localhost:3000`

#### 2. 启动前端开发服务器
在第二个终端窗口：
```bash
cd file_management_frontend
npm run dev
```

前端应用默认运行在：`http://localhost:5173`

### 方式二：使用并发启动（快速启动）

如果项目根目录配置了并发启动脚本：
```bash
npm run dev
```

## 验证服务器状态

### 检查后端
访问后端健康检查端点：
```bash
curl http://localhost:3000/api/health
```

或在浏览器访问：`http://localhost:3000/api/health`

### 检查前端
在浏览器访问：`http://localhost:5173`

## 常用开发命令

### 后端命令
```bash
# 开发模式（热重载）
npm run dev

# 构建生产版本
npm run build

# 运行生产版本
npm start

# 运行测试
npm test

# 查看数据库
npx prisma studio
```

### 前端命令
```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview

# 运行 linter
npm run lint

# 类型检查
npm run type-check
```

## 环境配置检查

### 后端环境变量
确保 `file_management_backend/.env` 包含：
```env
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
JWT_SECRET="your-secret-key"
PORT=3000
UPLOAD_DIR="./uploads"
```

### 前端环境变量
确保 `file_management_frontend/.env` 包含（如果需要）：
```env
VITE_API_BASE_URL=http://localhost:3000
```

## 故障排查

### 端口已被占用
如果端口被占用，可以：

**Windows:**
```bash
# 查找占用端口的进程
netstat -ano | findstr :3000
# 结束进程
taskkill /PID <进程ID> /F
```

**或修改端口：**
- 后端：修改 `.env` 中的 `PORT`
- 前端：修改 `vite.config.ts` 中的 `server.port`

### 数据库连接失败
1. 检查数据库是否运行
2. 验证 `DATABASE_URL` 配置
3. 检查数据库迁移状态：`npx prisma migrate status`
4. 如需要，运行迁移：`npx prisma migrate dev`

### 依赖问题
如果遇到依赖错误：
```bash
# 删除 node_modules 和 lock 文件
rm -rf node_modules package-lock.json
# 重新安装
npm install
```

### 热重载不工作
1. 检查文件监视器限制（Linux/Mac）
2. 重启开发服务器
3. 清除浏览器缓存

## 开发工作流建议

### 日常开发流程
1. 启动数据库（如果使用本地数据库）
2. 启动后端服务器（终端 1）
3. 启动前端服务器（终端 2）
4. 打开浏览器开发者工具
5. 开始编码

### 调试流程
1. 后端：查看终端日志
2. 前端：使用浏览器开发者工具
3. 数据库：使用 Prisma Studio 查看数据
4. API：使用 Postman 或 curl 测试接口

## 注意事项
- 🔄 **热重载**：修改代码后服务器会自动重启
- 💾 **数据持久化**：开发模式下数据会保存到数据库
- 🌐 **CORS**：确保后端已配置 CORS 允许前端访问
- 🔑 **认证**：开发时可能需要先创建管理员账户
- 📝 **日志**：注意查看终端输出的错误和警告信息

## 快速参考

| 服务 | 默认地址 | 命令目录 | 启动命令 |
|------|---------|---------|---------|
| 后端 API | http://localhost:3000 | file_management_backend | npm run dev |
| 前端应用 | http://localhost:5173 | file_management_frontend | npm run dev |
| Prisma Studio | http://localhost:5555 | file_management_backend | npx prisma studio |
