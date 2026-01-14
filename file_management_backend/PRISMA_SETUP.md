## 🚀 Prisma + TypeScript + MySQL 快速启动指南

### 📋 前置要求

1. **Node.js** >= 18.0.0
2. **MySQL** 数据库已安装并运行
3. **npm** 或 **yarn** 包管理器

---

### 🔧 第一步：安装依赖

```bash
cd file_management_backend
npm install
```

---

### 🗄️ 第二步：配置数据库

#### 1. 创建 MySQL 数据库

登录 MySQL 并创建数据库：

```sql
CREATE DATABASE file_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### 2. 配置环境变量

编辑 `.env` 文件，修改数据库连接字符串：

```env
DATABASE_URL="mysql://用户名:密码@localhost:3306/file_management"
```

示例：
```env
DATABASE_URL="mysql://root:123456@localhost:3306/file_management"
```

---

### 📊 第三步：运行数据库迁移

生成 Prisma Client 并创建数据库表：

```bash
# 生成 Prisma Client
npm run prisma:generate

# 创建数据库迁移并应用
npm run prisma:migrate
```

系统会提示输入迁移名称，例如：`init`

---

### 🌱 第四步：填充初始数据（可选）

运行种子脚本创建默认用户：

```bash
npm run prisma:seed
```

这将创建两个默认用户：
- **admin** / 123456
- **test** / 123456

---

### 🚀 第五步：启动开发服务器

```bash
npm run dev
```

服务器将在 **http://localhost:3000** 启动

---

### 🧪 第六步：测试 API

#### 1. 健康检查
```bash
curl http://localhost:3000/health
```

#### 2. 用户登录
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'
```

---

### 🛠️ Prisma 常用命令

#### 查看数据库（Prisma Studio）
```bash
npm run prisma:studio
```
在浏览器中打开 http://localhost:5555 查看和编辑数据

#### 生成 Prisma Client
```bash
npm run prisma:generate
```

#### 创建新迁移
```bash
npm run prisma:migrate
```

#### 重置数据库（⚠️ 会删除所有数据）
```bash
npx prisma migrate reset
```

#### 查看数据库状态
```bash
npx prisma migrate status
```

#### 格式化 Schema 文件
```bash
npx prisma format
```

---

### 📝 修改数据库结构

1. 编辑 `prisma/schema.prisma` 文件
2. 运行 `npm run prisma:migrate` 创建迁移
3. 运行 `npm run prisma:generate` 更新 Prisma Client

---

### 🔍 常见问题

#### 1. 数据库连接失败
- 检查 MySQL 是否运行
- 检查 `.env` 中的数据库连接字符串
- 确认数据库用户名和密码正确

#### 2. Prisma Client 未生成
运行：
```bash
npm run prisma:generate
```

#### 3. 迁移失败
重置数据库并重新迁移：
```bash
npx prisma migrate reset
npm run prisma:migrate
```

#### 4. 端口被占用
修改 `.env` 中的 `PORT` 值

---

### 📚 相关文档

- [Prisma 官方文档](https://www.prisma.io/docs)
- [Prisma Schema 参考](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
- [Prisma Client API](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference)

---

### 🎯 生产环境部署

#### 1. 构建 TypeScript
```bash
npm run build
```

#### 2. 运行迁移
```bash
npx prisma migrate deploy
```

#### 3. 启动服务器
```bash
npm start
```
