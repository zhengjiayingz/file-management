# 🎯 从这里开始！

## 📦 第一步：安装依赖

在 `file_management_backend` 目录下运行：

```bash
npm install
```

这将安装所有必需的依赖，包括：
- TypeScript
- Prisma
- Express 及其类型定义
- 其他依赖包

---

## 🗄️ 第二步：配置 MySQL 数据库

### 1. 确保 MySQL 已安装并运行

检查 MySQL 是否运行：
```bash
# Windows
net start MySQL80

# 或者通过服务管理器启动 MySQL
```

### 2. 创建数据库

登录 MySQL：
```bash
mysql -u root -p
```

创建数据库：
```sql
CREATE DATABASE file_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

### 3. 配置数据库连接

编辑 `.env` 文件，修改 `DATABASE_URL`：

```env
DATABASE_URL="mysql://root:你的密码@localhost:3306/file_management"
```

例如，如果你的 MySQL root 密码是 `123456`：
```env
DATABASE_URL="mysql://root:123456@localhost:3306/file_management"
```

---

## 🔄 第三步：初始化 Prisma

### 1. 生成 Prisma Client
```bash
npm run prisma:generate
```

### 2. 创建数据库表
```bash
npm run prisma:migrate
```

系统会提示输入迁移名称，输入：`init` 然后回车

### 3. 填充初始数据
```bash
npm run prisma:seed
```

这将创建默认用户：
- 用户名：`admin`，密码：`123456`
- 用户名：`test`，密码：`123456`

---

## 🚀 第四步：启动开发服务器

```bash
npm run dev
```

看到以下输出表示成功：
```
🚀 Server is running on port 3000
📝 Environment: development
🌐 CORS Origin: http://localhost:5174
💾 Database: Prisma + MySQL
```

---

## 🧪 第五步：测试 API

### 方法 1：使用 curl

#### 1. 健康检查
```bash
curl http://localhost:3000/health
```

#### 2. 登录
```bash
curl -X POST http://localhost:3000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"admin\",\"password\":\"123456\"}"
```

### 方法 2：使用浏览器

直接访问：http://localhost:3000/health

### 方法 3：使用 Postman

1. 导入环境变量：
   - `base_url`: http://localhost:3000
   
2. 测试登录接口：
   - Method: POST
   - URL: `{{base_url}}/api/auth/login`
   - Body (JSON):
   ```json
   {
     "username": "admin",
     "password": "123456"
   }
   ```

---

## 🎨 第六步：查看数据库（可选）

启动 Prisma Studio 可视化工具：

```bash
npm run prisma:studio
```

浏览器会自动打开 http://localhost:5555

在这里你可以：
- 查看所有数据表
- 添加、编辑、删除数据
- 查看表关系

---

## ✅ 验证清单

- [ ] 依赖安装成功（`npm install`）
- [ ] MySQL 数据库运行中
- [ ] 数据库 `file_management` 已创建
- [ ] `.env` 文件配置正确
- [ ] Prisma Client 已生成
- [ ] 数据库迁移成功
- [ ] 种子数据已填充
- [ ] 开发服务器启动成功
- [ ] 健康检查接口返回正常
- [ ] 登录接口测试成功

---

## 🔧 常见问题

### 1. npm install 失败
```bash
# 清除缓存重试
npm cache clean --force
npm install
```

### 2. 数据库连接失败
- 检查 MySQL 是否运行
- 检查 `.env` 中的用户名和密码
- 确认数据库 `file_management` 已创建

### 3. Prisma 迁移失败
```bash
# 重置数据库
npx prisma migrate reset
# 重新迁移
npm run prisma:migrate
```

### 4. 端口 3000 被占用
修改 `.env` 中的 `PORT`：
```env
PORT=3001
```

### 5. TypeScript 编译错误
```bash
# 重新安装依赖
rm -rf node_modules package-lock.json
npm install
```

---

## 📚 下一步

1. ✅ 阅读 `PRISMA_SETUP.md` 了解 Prisma 详细用法
2. ✅ 阅读 `MIGRATION_SUMMARY.md` 了解项目改进
3. ✅ 阅读 `README.md` 了解完整 API 文档
4. ✅ 开始前端集成

---

## 🎉 成功！

如果所有步骤都完成了，恭喜你！

你现在有一个：
- ✅ TypeScript 类型安全的后端
- ✅ Prisma ORM 数据库管理
- ✅ MySQL 持久化存储
- ✅ 完整的文件管理 API

开始开发吧！🚀
