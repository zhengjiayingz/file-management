# 数据库连接测试指南

## 🎯 目标

通过前端页面点击按钮，调用后端接口，测试数据库连接是否正常。

## 📋 步骤

### 1. 安装依赖

在后端目录安装 `mysql2`：

```bash
cd file_management_backend
npm install mysql2
```

或使用 pnpm：

```bash
pnpm install mysql2
```

### 2. 配置数据库连接

编辑 `file_management_backend/.env` 文件：

```env
DATABASE_URL="mysql://root:your_password@localhost:3306/file_management"
```

将 `your_password` 改成你的 MySQL 密码。

### 3. 启动测试服务器

在后端目录运行：

```bash
npm run test-server
```

你会看到：

```
🚀 测试服务器启动成功！
📡 服务器地址: http://localhost:3000
🔍 健康检查: http://localhost:3000/health
🧪 测试连接: http://localhost:3000/api/test/connection
📝 创建测试表: POST http://localhost:3000/api/test/create-table

等待请求...
```

### 4. 启动前端

在前端目录运行：

```bash
cd file_management_frontend
npm run dev
```

### 5. 访问测试页面

在浏览器中打开：

```
http://localhost:5174/test
```

### 6. 测试数据库连接

1. 点击 **"测试连接"** 按钮
2. 如果成功，会显示：
   - ✅ 数据库连接成功！
   - 数据库信息（名称、版本、用户等）
   - 当前数据库中的表列表

3. 点击 **"创建测试表"** 按钮
4. 如果成功，会显示：
   - ✅ 测试表创建成功！
   - 插入的测试数据

### 7. 在 MySQL 中验证

打开 MySQL 客户端，执行：

```sql
USE file_management;
SHOW TABLES;
SELECT * FROM test_connection;
```

你应该能看到 `test_connection` 表和里面的数据。

## 🔍 测试接口说明

### GET /api/test/connection

测试数据库连接，返回：

```json
{
  "success": true,
  "message": "数据库连接测试成功！",
  "info": {
    "database": "file_management",
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "tables": []
  }
}
```

### POST /api/test/create-table

创建测试表并插入数据，返回：

```json
{
  "success": true,
  "message": "测试表创建成功！",
  "data": [
    {
      "id": 1,
      "message": "数据库连接测试成功！",
      "created_at": "2024-01-14T12:00:00.000Z"
    }
  ]
}
```

## ❌ 常见错误

### 1. 连接被拒绝

```
Error: connect ECONNREFUSED 127.0.0.1:3306
```

**原因**: MySQL 服务未启动

**解决**: 启动 MySQL 服务

```bash
# Windows
net start MySQL80

# 或在服务管理器中启动
```

### 2. 访问被拒绝

```
Error: Access denied for user 'root'@'localhost'
```

**原因**: 用户名或密码错误

**解决**: 检查 `.env` 文件中的 `DATABASE_URL`，确保用户名和密码正确

### 3. 数据库不存在

```
Error: Unknown database 'file_management'
```

**原因**: 数据库未创建

**解决**: 测试程序会自动创建数据库，或手动创建：

```sql
CREATE DATABASE file_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. CORS 错误

```
Access to XMLHttpRequest has been blocked by CORS policy
```

**原因**: 跨域配置问题

**解决**: 确保后端 `.env` 中的 `CORS_ORIGIN` 设置正确：

```env
CORS_ORIGIN=http://localhost:5174
```

## 🎉 成功标志

如果看到以下内容，说明数据库连接正常：

1. ✅ 前端显示 "数据库连接成功！"
2. ✅ 后端控制台显示测试日志
3. ✅ MySQL 中能看到 `test_connection` 表
4. ✅ 表中有测试数据

## 📝 注意事项

1. 这是一个**临时测试服务器**，不是正式的应用服务器
2. 测试完成后，可以删除 `test_connection` 表
3. 正式开发时使用 `npm run dev` 启动完整的应用服务器
4. 测试服务器不依赖 Prisma，直接使用 `mysql2` 连接数据库

## 🔄 下一步

数据库连接测试成功后：

1. 解决 Prisma 引擎下载问题（使用镜像或 VPN）
2. 运行 `npx prisma generate` 生成 Prisma Client
3. 运行 `npx prisma migrate dev` 创建正式的数据表
4. 使用 `npm run dev` 启动完整的应用服务器

