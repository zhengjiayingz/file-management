# Swagger API 文档使用指南

## 访问 Swagger UI

启动后端服务器后，在浏览器中访问：

```
http://localhost:3000/api-docs
```

## 使用 JWT 认证测试 API

### 1. 获取 JWT Token

#### 方法一：注册新用户
1. 在 Swagger UI 中找到 **认证** 分类
2. 展开 `POST /api/auth/register` 接口
3. 点击 **Try it out**
4. 填写请求体：
   ```json
   {
     "username": "testuser",
     "password": "password123",
     "email": "test@example.com"
   }
   ```
5. 点击 **Execute**
6. 从响应中复制 `token` 值

#### 方法二：使用现有用户登录
1. 展开 `POST /api/auth/login` 接口
2. 点击 **Try it out**
3. 填写请求体：
   ```json
   {
     "username": "your_username",
     "password": "your_password"
   }
   ```
4. 点击 **Execute**
5. 从响应中复制 `token` 值

### 2. 配置认证

1. 点击页面顶部的 **Authorize** 按钮（锁形图标）
2. 在弹出的对话框中，直接粘贴 token（不需要 "Bearer" 前缀）
3. 点击 **Authorize**
4. 点击 **Close**

### 3. 测试需要认证的接口

现在你可以测试需要认证的接口了，例如：
- `GET /api/auth/me` - 获取当前用户信息
- `GET /api/user-preferences` - 获取用户偏好设置
- `PUT /api/user-preferences` - 更新用户偏好设置

## API 文档结构

### 认证接口 (Authentication)
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/refresh` - 刷新访问令牌
- `POST /api/auth/logout` - 用户登出
- `GET /api/auth/me` - 获取当前用户信息 🔒

### 用户偏好 (User Preferences)
- `GET /api/user-preferences` - 获取用户偏好设置 🔒
- `PUT /api/user-preferences` - 更新用户偏好设置 🔒

> 🔒 表示需要 JWT 认证

## 为新 API 添加文档注释

当你添加新的 API 端点时，使用以下格式添加 Swagger 文档注释：

```typescript
/**
 * @swagger
 * /api/your-endpoint:
 *   get:
 *     summary: 接口简要描述
 *     tags: [分类名称]
 *     security:
 *       - bearerAuth: []  # 如果需要认证
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 参数描述
 *     responses:
 *       200:
 *         description: 成功响应
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/schemas/UnauthorizedError'
 */
router.get('/your-endpoint', yourHandler);
```

### 常用标签（Tags）
- `认证` - 认证相关接口
- `用户偏好` - 用户偏好设置
- `文件管理` - 文件上传、下载、删除等
- `用户管理` - 用户信息管理

### 常用响应引用
- `$ref: '#/components/responses/UnauthorizedError'` - 401 未授权
- `$ref: '#/components/responses/NotFoundError'` - 404 未找到
- `$ref: '#/components/responses/ValidationError'` - 400 验证错误

### 常用 Schema 引用
- `$ref: '#/components/schemas/User'` - 用户对象
- `$ref: '#/components/schemas/UserPreference'` - 用户偏好对象
- `$ref: '#/components/schemas/File'` - 文件对象
- `$ref: '#/components/schemas/Error'` - 错误对象

## 导出 API 文档

### JSON 格式
访问以下 URL 获取 OpenAPI 3.0 JSON 格式的文档：
```
http://localhost:3000/api-docs.json
```

这个 JSON 文件可以：
- 导入到 Postman
- 导入到 Insomnia
- 用于生成客户端 SDK
- 用于 API 测试工具

## 生产环境配置

### 禁用 Swagger UI
在生产环境中，你可能想要禁用 Swagger UI。在 `app.ts` 中：

```typescript
// 仅在开发环境启用 Swagger
if (process.env.NODE_ENV !== 'production') {
  setupSwagger(app);
}
```

### 保护 Swagger UI
或者，你可以为 Swagger UI 添加基本认证：

```typescript
import basicAuth from 'express-basic-auth';

// 添加基本认证
app.use('/api-docs', basicAuth({
  users: { 'admin': 'your-secure-password' },
  challenge: true
}));

setupSwagger(app);
```

## 常见问题

### Q: 为什么我的新接口没有出现在 Swagger UI 中？
**A**: 确保：
1. 你添加了 `@swagger` JSDoc 注释
2. 路由文件在 `swagger.config.ts` 的 `apis` 数组中
3. 重启了开发服务器

### Q: 如何测试文件上传接口？
**A**: Swagger UI 支持文件上传。在文档注释中使用：
```yaml
requestBody:
  content:
    multipart/form-data:
      schema:
        type: object
        properties:
          file:
            type: string
            format: binary
```

### Q: 如何添加请求示例？
**A**: 在 schema 中添加 `example` 字段：
```yaml
properties:
  username:
    type: string
    example: testuser
```

### Q: Token 过期后怎么办？
**A**: 
1. 使用 `POST /api/auth/refresh` 接口刷新 token
2. 或重新登录获取新 token
3. 在 Swagger UI 中重新点击 **Authorize** 更新 token

## 相关资源

- [OpenAPI 3.0 规范](https://swagger.io/specification/)
- [Swagger UI 文档](https://swagger.io/tools/swagger-ui/)
- [swagger-jsdoc 文档](https://github.com/Surnet/swagger-jsdoc)
