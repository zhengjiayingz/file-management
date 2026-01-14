# 🚀 快速启动指南

## 第一步：安装依赖

在 `file_management_backend` 目录下运行：

```bash
npm install
```

## 第二步：启动服务器

### 开发模式（推荐）
```bash
npm run dev
```

### 生产模式
```bash
npm start
```

服务器将在 **http://localhost:3000** 启动

## 第三步：测试 API

### 1. 健康检查
```bash
curl http://localhost:3000/health
```

### 2. 用户登录
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'
```

返回示例：
```json
{
  "success": true,
  "message": "登录成功",
  "data": {
    "user": {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 3. 获取当前用户信息
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 4. 上传文件
```bash
curl -X POST http://localhost:3000/api/files/upload \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "file=@/path/to/your/file.pdf"
```

### 5. 获取文件列表
```bash
curl http://localhost:3000/api/files \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## 📝 使用 Postman 测试

### 1. 导入环境变量
创建环境变量：
- `base_url`: http://localhost:3000
- `token`: (登录后获取)

### 2. 登录获取 Token
- Method: POST
- URL: `{{base_url}}/api/auth/login`
- Body (JSON):
```json
{
  "username": "admin",
  "password": "123456"
}
```

### 3. 设置 Token
将返回的 token 保存到环境变量 `token` 中

### 4. 测试其他接口
在请求头中添加：
- Key: `Authorization`
- Value: `Bearer {{token}}`

## 🔧 常见问题

### 端口被占用
修改 `.env` 文件中的 `PORT` 值：
```
PORT=3001
```

### CORS 错误
修改 `.env` 文件中的 `CORS_ORIGIN`：
```
CORS_ORIGIN=http://localhost:5174
```

### 文件上传失败
检查 `uploads` 目录是否存在且有写入权限

## 📱 前端集成

在前端项目中配置 API 基础路径：

```javascript
// axios 配置示例
const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// 添加请求拦截器（自动添加 token）
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

## 🎯 下一步

1. 查看 `README.md` 了解完整的 API 文档
2. 查看 `PROJECT_STRUCTURE.md` 了解项目结构
3. 根据需求修改和扩展功能
4. 集成数据库替换内存存储
