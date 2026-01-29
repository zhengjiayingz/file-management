---
name: 用户管理助手
description: 管理系统用户，包括创建管理员、重置密码和用户权限管理
---

# 用户管理助手

## 概述
这个技能帮助你管理文件管理系统的用户账户，包括创建管理员账户、重置用户密码、管理用户权限等操作。

## 使用场景
- 初始化系统时创建第一个管理员账户
- 创建新的管理员或普通用户
- 重置用户密码
- 检查用户账户状态
- 管理用户权限和角色

## 前置条件
- 数据库已启动并完成迁移
- 后端服务器可以访问数据库
- 位于 `file_management_backend` 目录

## 执行步骤

### 1. 创建管理员账户

#### 使用脚本创建（推荐）
项目提供了 `create-admin.ts` 脚本：

```bash
cd file_management_backend
npx tsx scripts/create-admin.ts
```

脚本会提示输入：
- 用户名
- 密码
- 邮箱（可选）

#### 检查管理员账户
使用 `check-admin.ts` 脚本验证：

```bash
npx tsx scripts/check-admin.ts
```

### 2. 通过 API 创建用户

#### 注册普通用户
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "password": "password123",
    "email": "user@example.com"
  }'
```

#### 管理员创建用户（需要认证）
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "username": "newuser",
    "password": "password123",
    "email": "user@example.com",
    "role": "USER"
  }'
```

### 3. 使用 Prisma Studio 管理

启动 Prisma Studio 可视化界面：
```bash
npx prisma studio
```

在浏览器中可以：
- 查看所有用户
- 编辑用户信息
- 删除用户
- 修改用户角色

## 用户角色说明

### ADMIN（管理员）
- 完全的系统访问权限
- 可以管理所有用户
- 可以访问所有文件
- 可以修改系统设置

### USER（普通用户）
- 只能访问自己的文件
- 可以上传和管理自己的文件
- 不能访问其他用户的文件
- 不能修改系统设置

## 常用操作

### 重置用户密码

#### 方式一：通过 Prisma Studio
1. 运行 `npx prisma studio`
2. 找到目标用户
3. 生成新密码的哈希值（使用 bcrypt）
4. 更新 `password` 字段

#### 方式二：通过脚本
创建密码重置脚本 `scripts/reset-password.ts`：

```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetPassword(username: string, newPassword: string) {
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  await prisma.user.update({
    where: { username },
    data: { password: hashedPassword }
  });
  
  console.log(`密码已重置: ${username}`);
}

// 使用示例
resetPassword('admin', 'newpassword123')
  .then(() => prisma.$disconnect())
  .catch(console.error);
```

运行：
```bash
npx tsx scripts/reset-password.ts
```

### 查看所有用户

#### 使用 Prisma Studio
```bash
npx prisma studio
```

#### 使用脚本
创建 `scripts/list-users.ts`：

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      createdAt: true
    }
  });
  
  console.table(users);
}

listUsers()
  .then(() => prisma.$disconnect())
  .catch(console.error);
```

### 删除用户

⚠️ **警告：删除用户会同时删除其所有文件！**

```bash
# 通过 API（需要管理员权限）
curl -X DELETE http://localhost:3000/api/users/:userId \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 修改用户角色

```bash
# 将用户提升为管理员
curl -X PATCH http://localhost:3000/api/users/:userId \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"role": "ADMIN"}'
```

## 安全注意事项

- 🔐 **密码强度**：确保密码足够复杂（至少 8 位，包含字母和数字）
- 🔑 **JWT 密钥**：生产环境使用强随机 JWT_SECRET
- 👤 **管理员账户**：限制管理员账户数量
- 📝 **审计日志**：记录重要的用户操作
- 🚫 **权限检查**：确保 API 端点有适当的权限验证
- 🔒 **密码存储**：永远不要以明文存储密码

## 故障排查

### 无法创建管理员
1. 检查数据库连接
2. 验证 schema 是否最新：`npx prisma migrate status`
3. 检查是否已存在同名用户
4. 查看后端日志错误信息

### 登录失败
1. 验证用户名和密码
2. 检查密码哈希是否正确
3. 验证 JWT_SECRET 配置
4. 查看后端认证日志

### 权限问题
1. 检查用户的 `role` 字段
2. 验证 JWT token 是否有效
3. 检查 API 路由的权限中间件
4. 查看请求头中的 Authorization

## 示例工作流

### 初始化系统
```bash
# 1. 运行数据库迁移
cd file_management_backend
npx prisma migrate dev

# 2. 创建管理员账户
npx tsx scripts/create-admin.ts

# 3. 验证管理员账户
npx tsx scripts/check-admin.ts

# 4. 启动服务器
npm run dev

# 5. 测试登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password"}'
```

### 添加新用户
```bash
# 1. 获取管理员 token（登录）
# 2. 使用 token 创建新用户
# 3. 通知用户其登录凭据
# 4. 验证新用户可以登录
```

## 快速参考

| 操作 | 命令/脚本 |
|------|----------|
| 创建管理员 | `npx tsx scripts/create-admin.ts` |
| 检查管理员 | `npx tsx scripts/check-admin.ts` |
| 查看用户 | `npx prisma studio` |
| 重置密码 | 使用自定义脚本或 Prisma Studio |
| 修改角色 | API PATCH 请求或 Prisma Studio |
