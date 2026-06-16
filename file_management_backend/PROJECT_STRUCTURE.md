# 项目结构说明

> 后端为 **TypeScript + Express + Prisma（MySQL）**，数据持久化在数据库，文件在 `uploads/` / `previews/`。  
> 阶段六起支持 **Docker Compose**（`api` + `worker` + `redis`）与本机 `pnpm dev` 两种运行方式。

## 📂 根目录

```
file_management_backend/
├── prisma/
│   ├── schema.prisma          # 数据模型（User、UserFile、FileStorage 等）
│   └── migrations/            # 数据库迁移 SQL
├── src/                       # TypeScript 源码（编译到 dist/）
├── uploads/                   # 用户上传文件（运行时生成）
├── previews/                  # Office 预览 PDF 缓存（运行时生成）
├── test/                      # Vitest 集成测试
├── scripts/                   # 维护脚本
├── Dockerfile                 # 多阶段镜像：target=api | worker
├── docker-compose.yml         # redis + api + worker（MySQL 可连宿主机）
├── docker-compose.dev.yml     # 仅 Redis，配合本机 pnpm dev
├── .env / .env.example        # 环境变量
├── package.json
├── tsconfig.json
└── README.md
```

## 📂 `/src` 源代码

### 入口与应用组装

| 文件 | 说明 |
|------|------|
| `app.ts` | 进程入口：连 Redis、创建 HTTP 服务、挂载 Socket.IO、启动定时任务 |
| `createApp.ts` | Express 应用：中间件、路由、Helmet、CORS、Swagger |
| `loadEnv.ts` | 尽早加载 `.env`（ESM 下须在其它模块读 env 之前） |

### `/src/controllers` — 控制器层

处理 HTTP 请求，调用 Service / Prisma，返回 JSON 或文件流。

| 文件 / 目录 | 说明 |
|-------------|------|
| `auth.controller.ts` | 注册、登录、刷新 Token、会话、改密、TOTP |
| `user.controller.ts` | 用户资料、头像 |
| `user-preference.controller.ts` | 用户偏好设置 |
| `admin.controller.ts` | 管理员：用户、系统设置、踢会话等 |
| `vip.controller.ts` | VIP 升级申请与审核 |
| `friendship.controller.ts` | 好友关系 |
| `message.controller.ts` | 站内消息 |
| `share.controller.ts` | 链接分享、访问计数 |
| `log.controller.ts` | 操作日志查询 |
| `file/upload.controller.ts` | 普通上传、分片、秒传、合并 |
| `file/query.controller.ts` | 列表、下载、预览、搜索 |
| `file/manage.controller.ts` | 重命名、移动、回收站 |
| `file/version.controller.ts` | 文件历史版本 |
| `file/fileTag.controller.ts` | 文件标签 |
| `file/archiveExtract.controller.ts` | 压缩包解压入库 |

### `/src/routes` — 路由层

将 URL 映射到控制器；多数路由经 `auth.middleware` 鉴权。

`auth.routes.ts`、`user.routes.ts`、`file.routes.ts`、`admin.routes.ts`、`share.routes.ts`、`message.routes.ts`、`friendship.routes.ts`、`vip.routes.ts`、`log.routes.ts`、`user-preference.routes.ts`

### `/src/middleware` — 中间件

| 文件 | 说明 |
|------|------|
| `auth.middleware.ts` | JWT 校验、`req.user` |
| `admin.middleware.ts` | 管理员权限 |
| `mustChangePassword.middleware.ts` | 强制改密拦截 |
| `rateLimit.middleware.ts` | 登录 / API 限流（Redis，降级内存） |
| `upload.middleware.ts` / `avatarUpload.middleware.ts` | Multer 上传 |
| `error.middleware.ts` | 全局错误处理 |
| `notFound.middleware.ts` | 404 |

### `/src/services` — 业务服务层

可复用逻辑，供控制器与 Worker 调用。

| 文件 | 说明 |
|------|------|
| `preview.service.ts` | Office→PDF、BullMQ 入队、LibreOffice 调用 |
| `mergeUpload.service.ts` | 分片合并、秒传、本地文件登记 |
| `logger.service.ts` | 操作日志写入 |
| `passwordPolicy.service.ts` | 密码强度策略 |
| `systemSettings.service.ts` | 系统配置 |
| `tagLimit.service.ts` | 标签数量限制 |
| `adminFriend.service.ts` | 管理员默认好友 |

### `/src/queues` + `/src/workers` — 预览队列

| 文件 | 说明 |
|------|------|
| `queues/preview.queue.ts` | BullMQ 队列 `preview-convert`、入队与等待完成 |
| `workers/preview.worker.ts` | 消费转码任务（dev 与本机 worker 容器共用逻辑） |

开发时 `pnpm dev` 用 `concurrently` 同进程起 API + Worker；Docker 下 **api / worker 分容器**。

### `/src/lib` — 基础设施

| 文件 | 说明 |
|------|------|
| `prisma.ts` | Prisma Client 单例 |
| `redis.ts` | ioredis 连接 |
| `logger.ts` | pino 日志 |
| `healthCheck.ts` | `/health` MySQL + Redis 探测 |

### 其它目录

| 目录 | 说明 |
|------|------|
| `config/swagger.config.ts` | OpenAPI / Swagger UI |
| `realtime/socket.ts` | Socket.IO + Redis Adapter |
| `jobs/cleanup.job.ts` | 定时清理无引用物理文件 |
| `types/` | 共享 TypeScript 类型 |
| `utils/` | 路径、文件、邮件等工具函数 |

## 🗄️ 数据层（Prisma + MySQL）

不再使用内存 `models/`。实体定义在 `prisma/schema.prisma`，通过 `@prisma/client` 访问。

主要模型：`User`、`UserFile`、`FileStorage`、`UploadChunk`、`FileShare`、`Message`、`Friendship`、`OperationLog`、`LoginLog`、`RefreshToken`、`SystemSettings` 等。

迁移命令：

```bash
pnpm exec prisma migrate dev    # 开发：生成并应用迁移
pnpm exec prisma migrate deploy # 生产 / Docker 启动时应用
pnpm prisma:studio              # 可视化管理数据
```

## 🔄 请求流程

```
客户端
  ↓
routes（路由）
  ↓
middleware（鉴权、限流、上传解析）
  ↓
controllers（参数校验、编排）
  ↓
services / Prisma（业务与持久化）
  ↓
uploads/、previews/ 或 Redis 队列
  ↓
JSON / 文件流 / WebSocket 事件
```

**Office 预览**：`query.controller` → `preview.service` 入队 → `preview.worker` 转 PDF → 写入 `previews/` → API 读文件返回。

## 🐳 Docker 相关文件

| 文件 | 说明 |
|------|------|
| `Dockerfile` | `deps` → `build` → `runtime-base`；`api` 无 LibreOffice；`worker` 含 LibreOffice |
| `docker-compose.yml` | `redis` + `api` + `worker`；`uploads`/`previews` bind mount |
| `docker-compose.dev.yml` | 仅 `redis:6379`，供本机 `pnpm dev` |
| `.dockerignore` | 排除 `node_modules`、`uploads` 等 |

详见 [README.md](./README.md) 中「Docker 与开发启动指南」。

## 📋 代码规范

### 文件命名

- 控制器：`*.controller.ts`
- 路由：`*.routes.ts`
- 中间件：`*.middleware.ts`
- 服务：`*.service.ts`
- 工具：`*.utils.ts` / `*.util.ts`

编译产物在 `dist/`，结构与 `src/` 对应（`.js` + source map）。

### 响应格式

```typescript
// 成功
{ "success": true, "message": "...", "data": { ... } }

// 失败
{ "success": false, "message": "...", "errors": { ... } }  // errors 可选
```

## 🔐 安全与横切能力

- JWT（Access + Refresh）、`session_version` 强失效
- 密码哈希、强度策略、TOTP、强制改密
- Helmet、CORS、Redis 限流
- 操作日志、登录日志
- 上传类型与大小限制

## 🧪 测试

`test/` 下为 Vitest 集成测试（`auth`、`file.upload`、`message` 等），使用 `test/helpers/` 造数。

```bash
pnpm test
pnpm test:watch
```
