# 项目结构说明

## 📂 目录组织

### `/src` - 源代码目录

#### `/src/controllers` - 控制器层
负责处理业务逻辑，接收请求并返回响应。

- `auth.controller.js` - 认证相关（登录、注册）
- `file.controller.js` - 文件管理（上传、下载、删除）
- `user.controller.js` - 用户管理（获取、更新资料）

#### `/src/middleware` - 中间件层
处理请求前的预处理逻辑。

- `auth.middleware.js` - JWT 认证中间件
- `error.middleware.js` - 全局错误处理
- `notFound.middleware.js` - 404 处理
- `upload.middleware.js` - 文件上传配置（Multer）

#### `/src/models` - 数据模型层
定义数据结构（当前使用内存存储）。

- `user.model.js` - 用户数据模型
- `file.model.js` - 文件数据模型

#### `/src/routes` - 路由层
定义 API 端点和路由规则。

- `auth.routes.js` - 认证路由
- `file.routes.js` - 文件路由
- `user.routes.js` - 用户路由

#### `/src/utils` - 工具函数
通用的辅助函数。

- `response.util.js` - 统一响应格式

#### `/src/app.js` - 应用入口
Express 应用的主文件，配置中间件和路由。

### `/uploads` - 文件上传目录
存储用户上传的文件。

## 🔄 请求流程

```
客户端请求
    ↓
路由 (routes)
    ↓
中间件 (middleware)
    ↓
控制器 (controllers)
    ↓
模型 (models)
    ↓
响应返回客户端
```

## 🎯 设计模式

### MVC 架构
- **Model (模型)**: 数据层，负责数据存储和操作
- **View (视图)**: 由前端 Vue 项目负责
- **Controller (控制器)**: 业务逻辑层，处理请求和响应

### RESTful API 设计
- GET - 获取资源
- POST - 创建资源
- PUT - 更新资源
- DELETE - 删除资源

## 📋 代码规范

### 文件命名
- 控制器: `*.controller.js`
- 路由: `*.routes.js`
- 中间件: `*.middleware.js`
- 模型: `*.model.js`
- 工具: `*.util.js`

### 函数命名
- 使用驼峰命名法
- 控制器函数使用动词开头（get, create, update, delete）
- 中间件函数使用名词或形容词

### 响应格式
统一的 JSON 响应格式：

```javascript
// 成功响应
{
  "success": true,
  "message": "操作成功",
  "data": { ... }
}

// 错误响应
{
  "success": false,
  "message": "错误信息",
  "errors": { ... }  // 可选
}
```

## 🔐 安全措施

1. **JWT 认证**: 使用 JWT Token 进行身份验证
2. **密码加密**: 使用 bcrypt 加密存储密码
3. **CORS 配置**: 限制跨域访问来源
4. **文件类型验证**: 限制上传文件类型
5. **文件大小限制**: 防止大文件攻击

## 🚀 扩展建议

### 数据库集成
当前使用内存存储，建议集成：
- **MySQL**: 关系型数据库
- **MongoDB**: 文档型数据库
- **PostgreSQL**: 高级关系型数据库

### 缓存系统
- **Redis**: 用于 Session、Token 缓存

### 文件存储
- **本地存储**: 当前方案
- **云存储**: OSS、S3、七牛云等

### 日志系统
- **Winston**: 日志记录
- **Morgan**: HTTP 请求日志

### API 文档
- **Swagger**: 自动生成 API 文档

### 测试
- **Jest**: 单元测试
- **Supertest**: API 测试
