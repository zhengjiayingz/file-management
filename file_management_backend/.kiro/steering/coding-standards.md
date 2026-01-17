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

### 数据库操作规范

#### 🎯 核心原则：优先使用 ORM

**强制规则：尽可能使用 Prisma ORM，避免直接编写 SQL 语句**

##### ✅ 推荐做法

1. **使用 Prisma Client 进行数据库操作**
   ```typescript
   // ✅ 好的做法
   const user = await prisma.user.findUnique({
     where: { username }
   });
   
   // ✅ 使用事务
   const result = await prisma.$transaction(async (tx) => {
     const user = await tx.user.create({ data: userData });
     await tx.loginLog.create({ data: logData });
     return user;
   });
   ```

2. **使用 Prisma 的类型安全特性**
   ```typescript
   // ✅ 利用 Prisma 生成的类型
   const users: User[] = await prisma.user.findMany({
     select: {
       id: true,
       username: true,
       email: true
     }
   });
   ```

3. **使用 Prisma 的关联查询**
   ```typescript
   // ✅ 使用 include 或 select 进行关联查询
   const userWithFiles = await prisma.user.findUnique({
     where: { id: userId },
     include: {
       userFiles: {
         where: { isDeleted: false }
       }
     }
   });
   ```

##### ❌ 避免的做法

1. **直接编写 SQL 语句**
   ```typescript
   // ❌ 避免这样做
   const [users] = await connection.execute(
     'SELECT * FROM users WHERE username = ?',
     [username]
   );
   ```

2. **手动管理数据库连接**
   ```typescript
   // ❌ 避免这样做
   const connection = await mysql.createConnection(config);
   // ... 操作
   await connection.end();
   ```

##### 🔄 例外情况

只有在以下情况下才考虑使用原生 SQL：

1. **复杂的聚合查询**：Prisma 无法表达的复杂统计查询
2. **性能关键场景**：经过测试证明 ORM 性能不足的场景
3. **数据库特定功能**：需要使用 MySQL 特有功能的场景

即使在这些情况下，也应该：
- 使用 Prisma 的 `$queryRaw` 或 `$executeRaw`
- 保持类型安全
- 添加详细注释说明为什么不使用 ORM

```typescript
// 🔄 例外情况的正确做法
const result = await prisma.$queryRaw`
  SELECT 
    DATE(created_at) as date,
    COUNT(*) as count
  FROM users 
  WHERE created_at >= ${startDate}
  GROUP BY DATE(created_at)
`;
```

##### 数据库架构管理

1. **使用 Prisma Schema 定义数据模型**
   - 所有表结构在 `prisma/schema.prisma` 中定义
   - 使用 `prisma db push` 同步到数据库

2. **保持 Schema 和数据库同步**
   ```bash
   # 生成 Prisma Client
   pnpm prisma:generate
   
   # 同步 Schema 到数据库
   pnpm prisma:db:push
   ```

##### 统一的 Prisma Client 实例

```typescript
// 使用 src/lib/prisma.ts 中的单例实例
import prisma from '../lib/prisma.js';

// ✅ 正确使用
const user = await prisma.user.findUnique({ where: { id } });

// ❌ 避免创建新实例
const newPrisma = new PrismaClient(); // 不推荐
```

##### 错误处理

```typescript
import { Prisma } from '@prisma/client';

try {
  const result = await prisma.user.create({ data });
  return result;
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // 处理已知的 Prisma 错误
    if (error.code === 'P2002') {
      throw new Error('用户名已存在');
    }
  }
  throw error;
}
```

##### 查询优化

```typescript
// ✅ 选择性查询 - 只查询需要的字段
const user = await prisma.user.findUnique({
  where: { id },
  select: {
    id: true,
    username: true,
    email: true
  }
});

// ✅ 批量操作
await prisma.user.createMany({
  data: users,
  skipDuplicates: true
});

// ✅ 使用事务保证数据一致性
const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: userData });
  await tx.operationLog.create({ data: logData });
  return user;
});
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
