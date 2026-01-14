# 数据库设计规范

## Prisma Schema 规范

### 模型命名

#### 模型名称
- 使用 PascalCase 单数形式: `User`, `File`, `FileCategory`
- 表示实体的名词
- 清晰描述业务对象

```prisma
// ✅ 好的命名
model User { }
model File { }
model FileCategory { }

// ❌ 避免的命名
model Users { }  // 不使用复数
model user { }   // 不使用小写
model Data { }   // 太泛化
```

### 字段命名

#### 字段名称规则
- 使用 camelCase: `userId`, `createdAt`, `isActive`
- 布尔字段使用 `is/has/can` 前缀: `isActive`, `hasAccess`
- 日期字段使用 `At` 后缀: `createdAt`, `updatedAt`, `deletedAt`

```prisma
model User {
  id        Int      @id @default(autoincrement())
  username  String   @unique
  email     String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 数据库映射

#### 表名和列名映射
- 表名使用 snake_case 复数: `users`, `file_categories`
- 列名使用 snake_case: `user_id`, `created_at`

```prisma
model User {
  id        Int      @id @default(autoincrement())
  username  String   @unique
  createdAt DateTime @default(now()) @map("created_at")
  
  @@map("users")
}
```

### 主键设计

#### 自增主键
```prisma
model User {
  id Int @id @default(autoincrement())
}
```

#### UUID 主键
```prisma
model User {
  id String @id @default(uuid())
}
```

#### 复合主键
```prisma
model UserRole {
  userId Int
  roleId Int
  
  @@id([userId, roleId])
}
```

### 外键关系

#### 一对多关系
```prisma
model User {
  id    Int    @id @default(autoincrement())
  files File[]
  
  @@map("users")
}

model File {
  id     Int  @id @default(autoincrement())
  userId Int  @map("user_id")
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@map("files")
}
```

#### 一对一关系
```prisma
model User {
  id      Int      @id @default(autoincrement())
  profile Profile?
}

model Profile {
  id     Int  @id @default(autoincrement())
  userId Int  @unique @map("user_id")
  user   User @relation(fields: [userId], references: [id])
}
```

#### 多对多关系
```prisma
model User {
  id    Int    @id @default(autoincrement())
  roles Role[]
}

model Role {
  id    Int    @id @default(autoincrement())
  users User[]
}
```

### 索引设计

#### 单列索引
```prisma
model User {
  id       Int    @id @default(autoincrement())
  username String @unique
  email    String
  
  @@index([email])
}
```

#### 复合索引
```prisma
model File {
  id        Int      @id @default(autoincrement())
  userId    Int      @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")
  
  @@index([userId, createdAt])
}
```

#### 唯一索引
```prisma
model User {
  id       Int    @id @default(autoincrement())
  username String @unique
  email    String
  
  @@unique([email])
}
```

### 数据类型

#### 常用数据类型
```prisma
model Example {
  // 整数
  id       Int      @id @default(autoincrement())
  count    Int      @default(0)
  
  // 字符串
  name     String   @db.VarChar(100)
  content  String   @db.Text
  
  // 布尔
  isActive Boolean  @default(true)
  
  // 日期时间
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // 浮点数
  price    Float
  
  // 枚举
  status   Status   @default(PENDING)
  
  // JSON
  metadata Json?
}

enum Status {
  PENDING
  ACTIVE
  INACTIVE
}
```

### 默认值

#### 使用默认值
```prisma
model User {
  id        Int      @id @default(autoincrement())
  isActive  Boolean  @default(true)
  role      String   @default("user")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 可选字段

#### Nullable 字段
```prisma
model User {
  id       Int     @id @default(autoincrement())
  username String
  email    String? // 可选字段
  phone    String? // 可选字段
}
```

### 级联操作

#### 删除级联
```prisma
model User {
  id    Int    @id @default(autoincrement())
  files File[]
}

model File {
  id     Int  @id @default(autoincrement())
  userId Int  @map("user_id")
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

#### 级联选项
- `Cascade`: 删除父记录时删除子记录
- `SetNull`: 删除父记录时将外键设为 null
- `Restrict`: 有子记录时禁止删除父记录
- `NoAction`: 不执行任何操作

### 软删除

#### 实现软删除
```prisma
model User {
  id        Int       @id @default(autoincrement())
  username  String
  deletedAt DateTime? @map("deleted_at")
  
  @@map("users")
}
```

### 时间戳

#### 标准时间戳字段
```prisma
model User {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  
  @@map("users")
}
```

### 枚举类型

#### 定义枚举
```prisma
enum UserRole {
  ADMIN
  USER
  GUEST
}

enum FileStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

model User {
  id   Int      @id @default(autoincrement())
  role UserRole @default(USER)
}
```

### 数据验证

#### 字段约束
```prisma
model User {
  id       Int    @id @default(autoincrement())
  username String @unique @db.VarChar(50)
  email    String @db.VarChar(100)
  password String @db.VarChar(255)
  
  @@map("users")
}
```

### 迁移规范

#### 迁移命名
```bash
# 描述性的迁移名称
npx prisma migrate dev --name init
npx prisma migrate dev --name add_user_role
npx prisma migrate dev --name add_file_category
```

#### 迁移最佳实践
1. 每次 schema 变更都创建迁移
2. 使用描述性的迁移名称
3. 在生产环境使用 `prisma migrate deploy`
4. 不要手动修改迁移文件
5. 保留所有迁移历史

### 查询优化

#### 选择特定字段
```typescript
// ✅ 只选择需要的字段
const user = await prisma.user.findUnique({
  where: { id },
  select: {
    id: true,
    username: true,
    email: true
  }
});

// ❌ 避免选择所有字段
const user = await prisma.user.findUnique({
  where: { id }
});
```

#### 预加载关联数据
```typescript
// ✅ 使用 include 预加载
const users = await prisma.user.findMany({
  include: {
    files: true
  }
});

// ❌ 避免 N+1 查询
const users = await prisma.user.findMany();
for (const user of users) {
  const files = await prisma.file.findMany({
    where: { userId: user.id }
  });
}
```

### 事务处理

#### 使用事务
```typescript
await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({
    data: { username, password }
  });
  
  await tx.profile.create({
    data: { userId: user.id, bio: '' }
  });
});
```

### 数据库连接

#### 连接池配置
```env
DATABASE_URL="mysql://user:password@localhost:3306/database?connection_limit=10"
```

### 安全规范

#### 1. 密码存储
- 使用 bcrypt 加密
- 不在数据库中存储明文密码
- 密码字段长度至少 255 字符

#### 2. 敏感信息
- 不在日志中记录敏感信息
- 使用环境变量存储数据库凭证

#### 3. SQL 注入防护
- 使用 Prisma 的参数化查询
- 不拼接 SQL 字符串

### 性能优化

#### 1. 索引策略
- 为外键添加索引
- 为常用查询字段添加索引
- 避免过多索引

#### 2. 分页查询
```typescript
const users = await prisma.user.findMany({
  skip: (page - 1) * pageSize,
  take: pageSize
});
```

#### 3. 批量操作
```typescript
// 批量创建
await prisma.user.createMany({
  data: [
    { username: 'user1' },
    { username: 'user2' }
  ]
});

// 批量更新
await prisma.user.updateMany({
  where: { isActive: false },
  data: { deletedAt: new Date() }
});
```

### 备份策略

#### 定期备份
- 每日自动备份
- 保留最近 30 天的备份
- 测试备份恢复流程

### 监控和日志

#### 查询日志
```typescript
const prisma = new PrismaClient({
  log: ['query', 'error', 'warn']
});
```

#### 慢查询监控
- 记录执行时间超过 1 秒的查询
- 定期分析和优化慢查询
