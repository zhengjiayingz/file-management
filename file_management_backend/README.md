# File Management Backend

基于 Node.js + Express + TypeScript + Prisma 的文件管理系统后端。

## 📁 目录结构

请参考 [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)

## 🚀 快速启动

详细启动指南请参考根目录的开发环境助手：
`.agent/skills/dev-server/SKILL.md`

或者简单运行：
```bash
# 安装依赖
pnpm install

# 数据库迁移
pnpm prisma:db:push

# 启动开发服务器
pnpm dev
```

## 📡 API 文档

本项目使用 Swagger UI 作为 API 文档。
启动服务器后访问：**http://localhost:3000/api-docs**

## 🛠️ 技术栈

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: MySQL 8.0+
- **ORM**: Prisma
- **Auth**: JWT (AccessToken + RefreshToken)
- **Upload**: Multer + Stream (支持分片上传)

## 📝 核心功能

1. **用户认证**: 注册、登录、Token 刷新
2. **文件管理**: 上传（普通/分片/秒传）、下载、删除、重命名
3. **回收站**: 软删除、还原、彻底删除
4. **日志系统**: 全局操作日志记录

## ⚠️ 注意事项

- **数据库**: 请确保 `.env` 中的 `DATABASE_URL` 配置正确。
- **上传目录**: 默认上传到根目录下的 `uploads/`，请确保有写入权限。

## 生产部署

> 阶段三 3.3：生产环境 CORS 与关键环境变量说明。

### 必配环境变量

| 变量 | 开发示例 | 生产示例 | 说明 |
|------|----------|----------|------|
| `NODE_ENV` | `development` | `production` | 生产启用 Helmet 等安全中间件 |
| `CORS_ORIGIN` | `http://localhost:5173` | `https://你的前端域名` | 允许跨域访问的前端 Origin（见下文） |
| `JWT_SECRET` | 本地随机串 | **强随机串** | 禁止使用 `.env.example` 默认值 |
| `DATABASE_URL` | 本地 MySQL | 生产 MySQL | Prisma 连接串 |
| `REDIS_URL` | `redis://127.0.0.1:6379` | `redis://redis:6379` | 登录/全局限流、Socket 多实例 |

复制 `.env.example` 为 `.env` 后按环境修改；**勿将生产密钥提交到 Git**。

### CORS 配置（重要）

本 API 在 `createApp.ts` 中启用了 `credentials: true`（前端可携带 Cookie / `Authorization`），并暴露 `Content-Disposition` 供下载文件名使用。

**生产环境必须：**

1. 设置 **`CORS_ORIGIN=https://你的前端域名`**（含协议，**无**末尾 `/`）。
2. Origin 须与浏览器地址栏**完全一致**（协议 + 域名 + 端口），例如前端是 `https://app.example.com`，则 `.env` 写同一字符串。
3. **禁止**将 `CORS_ORIGIN` 设为 `*`。在 `credentials: true` 时，规范不允许 `Access-Control-Allow-Origin: *`，且会导致任意网站可跨域带凭证访问 API，风险极高。

**当前服务端逻辑（`src/createApp.ts`）：**

| 请求 Origin | 行为 |
|-------------|------|
| 无 Origin（Postman、部分服务端调用） | 允许 |
| `http://localhost:任意端口` | 允许（便于本地 Vue/React 联调） |
| 与 `CORS_ORIGIN` 一致的生产前端地址 | 允许（需正确配置 `.env`） |
| 其它 | 拒绝 |

**Socket.IO**（`src/realtime/socket.ts`）单独校验 Origin：除 localhost 外，仅当 `origin === process.env.CORS_ORIGIN` 时允许 WebSocket 连接。生产部署时 REST 与 Socket 应使用**同一前端域名**并写入 `CORS_ORIGIN`。

### 前端对应配置

**Vue / Vite（`file_management_frontend`）**

```env
# .env.development
VITE_API_BASE_URL=http://localhost:3000
```

```env
# .env.production
VITE_API_BASE_URL=https://api.example.com
```

**axios / fetch**

```typescript
// 若使用 Cookie 会话（本项目 JWT 通常放 Authorization 头，按前端实际为准）
axios.defaults.withCredentials = true;
```

前端请求的 API 域名与 `CORS_ORIGIN` 所代表的前端站点是**跨域**关系：浏览器 Origin 来自**前端页面 URL**，不是 API 的 URL。

### 部署前检查清单

- [ ] `CORS_ORIGIN` 为生产前端 HTTPS 地址，**不是** `*`
- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` 已更换为强密钥
- [ ] Redis、MySQL 可达（`REDIS_URL`、`DATABASE_URL`）
- [ ] 前端生产构建的 `VITE_API_BASE_URL` 指向生产 API
- [ ] 浏览器访问前端 → 登录、下载、实时消息（Socket）均正常

### 本地模拟生产（可选）

临时将 `.env` 中 `NODE_ENV=production`、`CORS_ORIGIN` 设为某 localhost 前端地址，重启 `pnpm dev`，用浏览器 Network 查看响应头是否含 `X-Content-Type-Options` 等（Helmet）。测完改回 `development`。
