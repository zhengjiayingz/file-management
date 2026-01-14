# 后端编码规范

## TypeScript 编码规范

### 命名约定

#### 文件命名
- 控制器: `*.controller.ts` (例: `auth.controller.ts`)
- 路由: `*.routes.ts` (例: `auth.routes.ts`)
- 中间件: `*.middleware.ts` (例: `auth.middleware.ts`)
- 类型定义: `*.types.ts` 或 `index.ts` (在 types 目录下)
- 工具函数: `*.util.ts` (例: `response.util.ts`)

#### 变量和函数命名
- 使用 camelCase: `getUserById`, `isAuthenticated`
- 常量使用 UPPER_SNAKE_CASE: `MAX_FILE_SIZE`, `JWT_SECRET`
- 类型/接口使用 PascalCase: `User`, `AuthRequest`, `ApiResponse`
- 私有属性使用下划线前缀: `_privateMethod`

#### 数据库命名 (Prisma)
- 模型名使用 PascalCase 单数: `User`, `File`
- 字段名使用 camelCase: `userId`, `createdAt`
- 数据库表名使用 snake_case 复数: `users`, `files`
- 数据库列名使用 snake_case: `user_id`, `created_at`

### 代码组织

#### 导入顺序
```typescript
// 1. Node.js 内置模块
import { fileURLToPath } from 'url';
import path from 'path';

// 2. 第三方库
import express from 'express';
import { PrismaClient } from '@prisma/client';

// 3. 项目内部模块
import prisma from '../lib/prisma.js';
import { AuthRequest } from '../types/index.js';

// 4. 类型导入
import type { Request, Response } from 'express';
```

#### 函数组织
- 控制器函数按 CRUD 顺序: create, read, update, delete
- 导出函数使用 named export: `export const login = ...`
- 辅助函数放在文件底部或单独的 utils 文件

### 类型定义

#### 必须定义类型
```typescript
// ✅ 好的做法
export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  const { username, password } = req.body as LoginBody;
  // ...
}

// ❌ 避免使用 any
const data: any = req.body; // 不推荐
```

#### 接口 vs 类型别名
- 对象结构使用 interface: `interface User { ... }`
- 联合类型使用 type: `type Status = 'active' | 'inactive'`

### 错误处理

#### 统一的错误响应
```typescript
// 使用统一的响应格式
res.status(400).json({
  success: false,
  message: '错误信息'
});
```

#### Try-Catch 使用
```typescript
// 所有异步操作必须使用 try-catch
try {
  const user = await prisma.user.findUnique({ ... });
} catch (error) {
  console.error('Error:', error);
  res.status(500).json({
    success: false,
    message: '操作失败'
  });
}
```

### 注释规范

#### 函数注释
```typescript
/**
 * 用户登录
 * @param req - 包含用户凭证的请求
 * @param res - 响应对象
 */
export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  // 实现
}
```

#### 复杂逻辑注释
```typescript
// 验证密码
// 使用 bcrypt 比较哈希密码
const isPasswordValid = await bcrypt.compare(password, user.password);
```

### 异步处理

#### 使用 async/await
```typescript
// ✅ 推荐
const user = await prisma.user.findUnique({ where: { id } });

// ❌ 避免使用 .then()
prisma.user.findUnique({ where: { id } }).then(user => { ... });
```

### 环境变量

#### 使用类型安全的环境变量
```typescript
// 使用 ! 断言或提供默认值
const JWT_SECRET = process.env.JWT_SECRET!;
const PORT = process.env.PORT || 3000;
```

### 数据验证

#### 输入验证
```typescript
// 验证必填字段
if (!username || !password) {
  res.status(400).json({
    success: false,
    message: '请提供用户名和密码'
  });
  return;
}
```

### 代码格式

#### 使用一致的格式
- 缩进: 2 空格
- 引号: 单引号
- 分号: 必须使用
- 行尾: LF (Unix)
- 最大行长: 100 字符

### 安全规范

#### 密码处理
```typescript
// 使用 bcrypt 加密密码
const hashedPassword = await bcrypt.hash(password, 10);
```

#### JWT 处理
```typescript
// 使用环境变量存储密钥
const token = jwt.sign(payload, process.env.JWT_SECRET!, {
  expiresIn: '7d'
});
```

#### SQL 注入防护
```typescript
// 使用 Prisma 的参数化查询（自动防护）
const user = await prisma.user.findUnique({
  where: { username } // 安全
});
```

### 性能优化

#### 数据库查询优化
```typescript
// 只选择需要的字段
const user = await prisma.user.findUnique({
  where: { id },
  select: {
    id: true,
    username: true,
    email: true
    // 不包含 password
  }
});
```

#### 避免 N+1 查询
```typescript
// 使用 include 预加载关联数据
const users = await prisma.user.findMany({
  include: {
    files: true
  }
});
```

### Git 提交规范

#### 提交信息格式
```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Type 类型
- feat: 新功能
- fix: 修复 bug
- docs: 文档更新
- style: 代码格式调整
- refactor: 重构
- test: 测试相关
- chore: 构建/工具相关

#### 示例
```
feat(auth): 添加用户注册功能

- 实现用户注册 API
- 添加密码加密
- 添加邮箱验证

Closes #123
```
