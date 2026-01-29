# API 文档指南

## 核心原则
本项目使用 **Swagger (OpenAPI 3.0)** 作为 API 文档的唯一真理源。请**不要**维护静态的 Markdown API 列表。

## 访问文档
启动后端开发服务器后，访问：
> **http://localhost:3000/api-docs**

在此页面，你可以：
- 查看所有可用的 API
- 查看请求参数和响应结构
- 直接测试 API 调用

## 使用 JWT 认证
大部分接口需要 Bearer Token。在 Swagger UI 中：
1. 调用 `POST /api/auth/login` 获取 token。
2. 点击页面右上角的 **Authorize** 按钮。
3. 粘贴 token 值（无需 `Bearer` 前缀）。
4. 点击 **Authorize** 确认。

## 开发指南

### 添加新接口文档
我们使用 `api-documentation` skill 来规范化 Swagger 注释的编写。

**推荐做法**：
参考 [.agent/skills/api-documentation/SKILL.md](../.agent/skills/api-documentation/SKILL.md) 获取最新的注释模板和最佳实践。

### 示例
```typescript
/**
 * @swagger
 * /api/example:
 *   get:
 *     summary: 示例接口
 *     tags: [示例]
 *     ...详细配置请参考 api-documentation skill
 */
```

### 常用引用
为了保持一致性，请复用 `src/config/swagger.config.ts` 中的组件：
- 认证错误: `$ref: '#/components/responses/UnauthorizedError'`
- 参数错误: `$ref: '#/components/responses/ValidationError'`
- 用户模型: `$ref: '#/components/schemas/User'`

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
