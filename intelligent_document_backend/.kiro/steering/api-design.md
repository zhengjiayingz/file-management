# API 设计规范

## RESTful API 设计原则

### URL 设计

#### 资源命名
- 使用名词复数: `/api/users`, `/api/files`
- 使用小写字母和连字符: `/api/user-profiles`
- 避免动词: ❌ `/api/getUsers` ✅ `/api/users`

#### 层级关系
```
GET    /api/users/:id/files        # 获取用户的文件列表
POST   /api/users/:id/files        # 为用户创建文件
GET    /api/users/:id/files/:fileId # 获取用户的特定文件
```

### HTTP 方法

#### 标准方法使用
- `GET`: 获取资源（幂等）
- `POST`: 创建资源
- `PUT`: 完整更新资源（幂等）
- `PATCH`: 部分更新资源
- `DELETE`: 删除资源（幂等）

#### 示例
```typescript
// 用户资源
GET    /api/users           # 获取用户列表
GET    /api/users/:id       # 获取单个用户
POST   /api/users           # 创建用户
PUT    /api/users/:id       # 完整更新用户
PATCH  /api/users/:id       # 部分更新用户
DELETE /api/users/:id       # 删除用户

// 认证
POST   /api/auth/login      # 登录
POST   /api/auth/register   # 注册
POST   /api/auth/logout     # 登出
GET    /api/auth/me         # 获取当前用户
```

### 状态码规范

#### 成功响应
- `200 OK`: 请求成功
- `201 Created`: 资源创建成功
- `204 No Content`: 请求成功但无返回内容

#### 客户端错误
- `400 Bad Request`: 请求参数错误
- `401 Unauthorized`: 未认证
- `403 Forbidden`: 无权限
- `404 Not Found`: 资源不存在
- `409 Conflict`: 资源冲突
- `422 Unprocessable Entity`: 验证失败

#### 服务器错误
- `500 Internal Server Error`: 服务器错误
- `503 Service Unavailable`: 服务不可用

### 响应格式

#### 统一的响应结构
```typescript
// 成功响应
{
  "success": true,
  "message": "操作成功",
  "data": {
    // 实际数据
  }
}

// 错误响应
{
  "success": false,
  "message": "错误信息",
  "errors": {
    // 详细错误（可选）
  }
}
```

#### 列表响应
```typescript
{
  "success": true,
  "data": [
    { "id": 1, "name": "Item 1" },
    { "id": 2, "name": "Item 2" }
  ],
  "total": 2,
  "page": 1,
  "pageSize": 10
}
```

### 认证和授权

#### JWT Token 认证
```typescript
// 请求头
Authorization: Bearer <token>

// 响应
{
  "success": true,
  "data": {
    "user": { ... },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### 认证错误响应
```typescript
// 401 Unauthorized
{
  "success": false,
  "message": "未提供认证令牌"
}

// 403 Forbidden
{
  "success": false,
  "message": "无权限访问此资源"
}
```

### 分页

#### 查询参数
```
GET /api/users?page=1&pageSize=10&sort=createdAt&order=desc
```

#### 响应格式
```typescript
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

### 过滤和搜索

#### 查询参数
```
GET /api/files?type=pdf&size_gt=1000&search=report
```

#### 实现示例
```typescript
const files = await prisma.file.findMany({
  where: {
    mimetype: { contains: 'pdf' },
    size: { gt: 1000 },
    originalName: { contains: search }
  }
});
```

### 排序

#### 查询参数
```
GET /api/users?sort=createdAt&order=desc
```

### 错误处理

#### 详细的错误信息
```typescript
// 验证错误
{
  "success": false,
  "message": "数据验证失败",
  "errors": {
    "username": ["用户名长度必须在 3-20 个字符之间"],
    "email": ["邮箱格式不正确"]
  }
}
```

#### 开发环境错误
```typescript
{
  "success": false,
  "message": "服务器内部错误",
  "stack": "Error: ...\n    at ..." // 仅开发环境
}
```

### 版本控制

#### URL 版本控制
```
/api/v1/users
/api/v2/users
```

#### 请求头版本控制
```
Accept: application/vnd.api+json; version=1
```

### 文件上传

#### Multipart Form Data
```typescript
POST /api/files/upload
Content-Type: multipart/form-data

// 响应
{
  "success": true,
  "message": "文件上传成功",
  "data": {
    "id": 1,
    "originalName": "document.pdf",
    "filename": "document-1234567890.pdf",
    "size": 102400,
    "uploadedAt": "2024-01-14T12:00:00Z"
  }
}
```

### 文件下载

#### 下载端点
```typescript
GET /api/files/:id/download

// 响应头
Content-Disposition: attachment; filename="document.pdf"
Content-Type: application/pdf
```

### CORS 配置

#### 允许的来源
```typescript
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5174',
  credentials: true
}));
```

### 速率限制

#### 限制规则
```typescript
// 登录接口: 5 次/分钟
// 文件上传: 10 次/小时
// 其他接口: 100 次/分钟
```

### API 文档

#### 端点文档格式
```typescript
/**
 * @route   POST /api/auth/login
 * @desc    用户登录
 * @access  Public
 * @body    { username: string, password: string }
 * @returns { user: User, token: string }
 */
```

### 健康检查

#### 健康检查端点
```typescript
GET /health

// 响应
{
  "status": "ok",
  "message": "File Management API is running",
  "timestamp": "2024-01-14T12:00:00Z",
  "database": "Prisma + MySQL"
}
```

### 最佳实践

#### 1. 使用 HTTPS
生产环境必须使用 HTTPS

#### 2. 输入验证
所有用户输入必须验证

#### 3. 输出转义
防止 XSS 攻击

#### 4. SQL 注入防护
使用 Prisma 的参数化查询

#### 5. 敏感信息保护
不在响应中返回密码等敏感信息

```typescript
// ✅ 好的做法
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

#### 6. 日志记录
记录所有重要操作和错误

```typescript
console.log(`User ${userId} logged in at ${new Date()}`);
console.error('Login error:', error);
```

#### 7. 幂等性
PUT 和 DELETE 操作应该是幂等的

#### 8. 缓存策略
使用适当的缓存头

```typescript
res.setHeader('Cache-Control', 'public, max-age=3600');
```
