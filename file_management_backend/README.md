# File Management Backend API

基于 Node.js + Express 的文件管理系统后端 API

## 📁 项目结构

```
file_management_backend/
├── src/
│   ├── controllers/        # 控制器层
│   │   ├── auth.controller.js
│   │   ├── file.controller.js
│   │   └── user.controller.js
│   ├── middleware/         # 中间件
│   │   ├── auth.middleware.js
│   │   ├── error.middleware.js
│   │   ├── notFound.middleware.js
│   │   └── upload.middleware.js
│   ├── models/            # 数据模型
│   │   ├── user.model.js
│   │   └── file.model.js
│   ├── routes/            # 路由
│   │   ├── auth.routes.js
│   │   ├── file.routes.js
│   │   └── user.routes.js
│   ├── utils/             # 工具函数
│   │   └── response.util.js
│   └── app.js             # 应用入口
├── uploads/               # 文件上传目录
├── .env                   # 环境变量
├── .env.example          # 环境变量示例
├── .gitignore            # Git 忽略文件
├── package.json          # 项目配置
└── README.md             # 项目文档
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd file_management_backend
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

### 3. 启动开发服务器

```bash
npm run dev
```

服务器将在 http://localhost:3000 启动

### 4. 生产环境启动

```bash
npm start
```

## 📡 API 接口

### 认证接口

#### 登录
- **POST** `/api/auth/login`
- Body: `{ "username": "admin", "password": "123456" }`

#### 注册
- **POST** `/api/auth/register`
- Body: `{ "username": "user", "password": "password", "email": "user@example.com" }`

#### 获取当前用户
- **GET** `/api/auth/me`
- Headers: `Authorization: Bearer <token>`

### 文件接口

#### 上传文件
- **POST** `/api/files/upload`
- Headers: `Authorization: Bearer <token>`
- Body: FormData with `file` field

#### 获取文件列表
- **GET** `/api/files`
- Headers: `Authorization: Bearer <token>`

#### 获取文件详情
- **GET** `/api/files/:id`
- Headers: `Authorization: Bearer <token>`

#### 下载文件
- **GET** `/api/files/:id/download`
- Headers: `Authorization: Bearer <token>`

#### 删除文件
- **DELETE** `/api/files/:id`
- Headers: `Authorization: Bearer <token>`

### 用户接口

#### 获取用户资料
- **GET** `/api/users/profile`
- Headers: `Authorization: Bearer <token>`

#### 更新用户资料
- **PUT** `/api/users/profile`
- Headers: `Authorization: Bearer <token>`
- Body: `{ "email": "newemail@example.com" }`

## 🔐 默认账号

- 用户名: `admin`
- 密码: `123456`

## 🛠️ 技术栈

- **Node.js** - JavaScript 运行环境
- **Express** - Web 框架
- **JWT** - 身份认证
- **Bcrypt** - 密码加密
- **Multer** - 文件上传
- **CORS** - 跨域支持

## 📝 注意事项

1. 当前使用内存存储数据，重启服务器后数据会丢失
2. 生产环境建议使用数据库（MySQL、MongoDB 等）
3. 修改 `.env` 中的 `JWT_SECRET` 为更安全的密钥
4. 根据需求调整文件上传大小限制

## 🔄 后续优化建议

1. 集成数据库（MySQL/MongoDB）
2. 添加数据验证（express-validator）
3. 添加日志系统（winston/morgan）
4. 添加单元测试（Jest）
5. 添加 API 文档（Swagger）
6. 添加限流保护（express-rate-limit）
7. 添加文件预览功能
8. 添加文件分类和标签
