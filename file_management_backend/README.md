# File Management Backend

基于 Node.js + Express + TypeScript + Prisma 的文件管理系统后端。

## 📁 目录结构

请参考 [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)

## 🚀 快速启动

详细启动指南请参考根目录的开发环境助手：
`.agent/skills/dev-server/SKILL.md`

**完整场景说明（Docker / 本机 / 改代码怎么测）见下文 [Docker 与开发启动指南](#-docker-与开发启动指南)。**

或者简单运行（**纯本机开发**，需本机 MySQL + Redis + LibreOffice）：

```bash
# 安装依赖
pnpm install

# 数据库迁移
pnpm prisma:db:push

# 启动开发服务器（API + Office 预览 Worker，一条命令）
pnpm dev

# 仅启动 API（不启预览 Worker）
pnpm dev:api

# 仅启动预览 Worker（需 REDIS_URL + LibreOffice）
pnpm worker:preview
```

**Office 预览（PPT/Word 转 PDF）**：`pnpm dev` 会同时起 API 与 BullMQ Preview Worker（经 `concurrently`）。需配置 `REDIS_URL`（如 `redis://127.0.0.1:6379`）并安装 LibreOffice。本地 Redis 可用 `docker compose -f docker-compose.dev.yml up -d`。

## 🐳 Docker 与开发启动指南

当前项目支持两种后端运行方式：**Docker Compose**（接近生产）与 **本机 `pnpm dev`**（热更新、日志直出终端）。前端始终在宿主机用 `pnpm dev` 启动。

### 前置条件

| 组件 | Docker 方式（`docker-compose.yml`） | 本机 `pnpm dev` |
|------|-------------------------------------|-----------------|
| **MySQL** | 本机 MySQL 服务（`3306`），compose 通过 `host.docker.internal` 连接 | 本机 MySQL，`.env` 中 `DATABASE_URL` 指向 `localhost:3306` |
| **Redis** | Docker 容器 `redis`（`6379`） | 本机 Redis 或 `docker compose -f docker-compose.dev.yml up -d` |
| **LibreOffice** | 仅在 **worker** 容器内，api 容器不含 | 需在本机安装（预览 Worker 在宿主机跑） |
| **Docker Desktop** | 必须运行 | 仅在使用 compose 时需要 |

前端（`file_management_frontend`）：

```env
# .env
VITE_API_BASE_URL=http://localhost:3000
```

### 启动方式一览

| 场景 | 适用情况 | 后端 | 前端 | 日志在哪看 |
|------|----------|------|------|------------|
| **A. 日常联调（推荐）** | 不改后端代码，只跑前端 | `docker compose up -d` | `pnpm dev` | `docker compose logs -f` |
| **B. 本机开发** | 改后端、要热更新 | `pnpm dev`（先停 Docker api/worker） | `pnpm dev` | 当前终端 |
| **C. 混合** | 本机 dev + Docker Redis | `docker-compose.dev.yml` + `pnpm dev` | `pnpm dev` | 当前终端 |
| **D. 验证 Docker 构建** | 改完代码要测容器镜像 | `docker compose up -d --build` | `pnpm dev` | `docker compose logs -f` |

> **不要同时**跑 Docker 的 `api` 与本机 `pnpm dev:api`，两者都会占用 `3000` 端口。  
> **不要同时**跑 Docker 的 `worker` 与本机 `worker:preview`，会抢同一 Redis 队列。

---

### 场景 A：日常联调（Docker 跑后端）

当前 `docker-compose.yml` 配置要点：

- **api**：`target: api`，端口 `3000`，连本机 MySQL（`host.docker.internal:3306`）
- **worker**：`target: worker`（含 LibreOffice），消费预览队列
- **redis**：队列与 Socket 适配器
- **uploads / previews**：挂载本机项目目录 `./uploads`、`./previews`（与数据库中的文件记录一致）

#### 第一次 / 完整启动

```bash
cd file_management_backend

# 1. 确保本机 MySQL 已启动（3306）
# 2. 确保 Docker Desktop 已运行

# 3. 构建并启动全部服务
docker compose up -d --build

# 4. 查看状态
docker compose ps
```

#### 日常开机后启动

```bash
# 本机 MySQL 启动后
cd file_management_backend
docker compose up -d

# 前端（另开终端）
cd ../file_management_frontend
pnpm dev
```

浏览器访问：前端 `http://localhost:5173`，API 文档 `http://localhost:3000/api-docs`。

#### 停止

```bash
cd file_management_backend
docker compose stop          # 停止容器，保留数据
# docker compose down        # 停止并删除容器（卷与 bind mount 数据仍在）
```

---

### 场景 B：本机开发（改代码、热更新）

适合添加功能、调试接口；`tsx watch` 改 `src/` 后自动重启，日志直接打在终端。

```bash
cd file_management_backend

# 1. 停掉 Docker 里的 api/worker（避免占 3000 和抢队列）
docker compose stop api worker
# redis 可继续用 compose 的，也可用 docker-compose.dev.yml

# 2. 确认 .env 指向本机
#    DATABASE_URL=mysql://...@localhost:3306/file_management
#    REDIS_URL=redis://127.0.0.1:6379
#    JWT_SECRET=...（与日常开发一致）

# 3. 启动（API + 预览 Worker）
pnpm dev

# 或拆开启动：
# pnpm dev:api
# pnpm worker:preview   # 另开终端，需本机 LibreOffice
```

前端另开终端 `pnpm dev`。

开发结束后若切回 Docker：

```bash
docker compose up -d api worker
```

---

### 场景 C：混合模式（仅 Docker 跑 Redis）

与阶段二开发方式一致：Redis 在容器，API/Worker 在宿主机。

```bash
cd file_management_backend
docker compose -f docker-compose.dev.yml up -d   # 仅 Redis
pnpm dev                                          # 本机 API + Worker
```

`.env` 中 `REDIS_URL=redis://127.0.0.1:6379`。

---

### 场景 D：改完代码后如何在 Docker 里测

Docker 运行的是编译后的 `dist/`，**改 `src/` 不会自动生效**，需重新构建：

```bash
cd file_management_backend

# 只改了 API 逻辑
docker compose up -d --build api

# 改了预览 / Worker 相关
docker compose up -d --build worker
# 或 api + worker 一起
docker compose up -d --build api worker
```

**数据库迁移**（新增 `prisma/migrations` 后）：

```bash
# 本机开发时（会生成迁移文件）
pnpm exec prisma migrate dev

# Docker / 生产式应用迁移
docker compose run --rm api pnpm exec prisma migrate deploy
# 或 api 启动命令里已包含 migrate deploy，重建 api 容器时会自动执行
```

**推荐工作流**：

1. 开发阶段：场景 B（`pnpm dev`）快速迭代  
2. 提交前：场景 D（`--build`）确认 Docker 镜像能正常跑  
3. 单元/集成测试：`pnpm test`（不依赖 Docker）

---

### 查看日志

Docker 方式下日志在容器内，用 `docker compose logs` 查看（JSON 一行一条，与 pino 输出一致）：

```bash
cd file_management_backend

# 实时跟踪 api
docker compose logs -f api

# 实时跟踪 worker（Office 转码）
docker compose logs -f worker

# api + worker 一起看
docker compose logs -f api worker

# 最近 50 行
docker compose logs api --tail 50
```

本机 `pnpm dev` 时，日志带 `[api]` / `[preview]` 前缀，直接显示在运行命令的终端。

---

### 常用命令速查

```bash
# 状态
docker compose ps

# 健康检查（api 启动后）
curl http://localhost:3000/health

# 重建单个服务
docker compose up -d --build api

# 进入 api 容器排查
docker compose exec api sh

# 清理已注释掉的旧 mysql 孤儿容器
docker compose up -d --remove-orphans

# Prisma Studio（连本机库）
pnpm prisma:studio
```

---

### 故障排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| `EADDRINUSE :::3000` | Docker api 与本机 `pnpm dev` 同时运行 | `docker compose stop api` 或停本机 dev |
| 登录提示用户名密码错误 | api 连了空库（Docker 内置 MySQL）而非本机库 | 确认 compose 中 `DATABASE_URL` 为 `host.docker.internal:3306`，且本机库有用户数据 |
| 预览一直转圈 | worker 未启动或 Redis 不可用 | `docker compose ps`，`docker compose logs worker` |
| api 反复重启 | `prisma migrate deploy` 失败 | `docker compose logs api`；本机库已有表时可用 `prisma migrate resolve` 处理失败记录 |
| 文件预览 404 | uploads 卷未挂载本机目录 | 确认 compose 中 `./uploads:/app/uploads` |

---

### Compose 文件说明

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | 生产式本地栈：redis + api + worker（MySQL 用本机） |
| `docker-compose.dev.yml` | 仅 Redis，配合本机 `pnpm dev` |
| `Dockerfile` | 多阶段构建；`target: api`（轻量）/ `target: worker`（含 LibreOffice） |

### Docker 镜像结构（任务 6.1）

```
Dockerfile 多阶段：
  base        → Node 20 + pnpm + openssl
  deps        → pnpm install
  build       → pnpm build（tsc + prisma generate）
  runtime-base→ 生产依赖 + dist/
  api         → 无 LibreOffice，CMD node dist/app.js
  worker      → 安装 LibreOffice，CMD node dist/workers/preview.worker.js
```

构建示例：

```bash
docker build --target api -t file-mgmt-api .
docker build --target worker -t file-mgmt-worker .
```

---

### Docker 常见问题（FAQ）

#### 1. 端口冲突

| 端口 | 占用方 | 现象 | 处理 |
|------|--------|------|------|
| `3000` | api（Docker 或本机） | `EADDRINUSE :::3000` | 二选一：`docker compose stop api` **或** 停本机 `pnpm dev` |
| `6379` | Redis | `ECONNREFUSED 127.0.0.1:6379` | `docker compose -f docker-compose.dev.yml up -d` 或 `docker compose up -d redis` |
| `3306` / `3307` | MySQL | 连接失败 | 确认本机 MySQL 服务已启动；compose 使用 `host.docker.internal:3306` |

Windows / macOS 容器访问宿主机 MySQL 使用 `host.docker.internal`；`docker-compose.yml` 中 api 已配置 `extra_hosts: host-gateway`。

#### 2. `uploads/`、`previews/` 权限

- 本机目录需对运行用户可写（上传、预览缓存、头像）。
- Docker bind mount 时，容器内以 `node` 用户写文件；Windows 上一般无问题，Linux 若遇权限错误：

```bash
mkdir -p uploads previews
chmod 775 uploads previews
```

- 数据库里存的是相对路径，物理文件必须在 api 与 worker **同一挂载路径**下，否则预览会「源文件不存在」或 PDF 404。

#### 3. Prisma 迁移失败（api 反复重启）

api 启动命令含 `prisma migrate deploy`。常见情况：

**（a）本机库已有表，迁移重复加列**

日志类似：`Duplicate column name 'xxx'`、`P3009`、`migrate found failed migrations`。

```bash
# 查看 api 日志
docker compose logs api --tail 30

# 将已手动对齐 schema 的迁移标为已应用（替换迁移名）
docker compose run --rm api pnpm exec prisma migrate resolve --applied <迁移目录名>

# 若需放弃失败记录并回滚标记
docker compose run --rm api pnpm exec prisma migrate resolve --rolled-back <迁移目录名>
```

**（b）全新 Docker MySQL 空库**

首次 `docker compose up` 会自动建表；若改用容器内 mysql 服务，需取消 `docker-compose.yml` 中 mysql 注释并改 `DATABASE_URL` 为 `mysql:3306`。

**（c）开发环境生成迁移**

在本机用 `pnpm exec prisma migrate dev`，提交 `prisma/migrations/` 后再构建 Docker。

#### 4. 登录 / Token 异常

| 现象 | 原因 | 处理 |
|------|------|------|
| 用户名密码正确却失败 | api 连了**空库**（容器 MySQL）而非本机库 | `DATABASE_URL` 指向 `host.docker.internal:3306` |
| 登录后接口 401 | `JWT_SECRET` 与签发时不一致 | compose 与 `.env` 保持一致，或重新登录 |
| 刷新失败 | 旧 refresh 在另一环境签发 | 清除浏览器本地 token，重新登录 |

#### 5. Office 预览不工作

1. `docker compose ps` 确认 **worker** 为 Up  
2. `docker compose logs worker` 应有 `[preview-worker] 已启动`  
3. 本机 `pnpm dev` 时需 **LibreOffice** 已安装，且 **Redis** 在跑  
4. 勿同时跑 Docker worker 与本机 `worker:preview`（抢同一队列）

#### 6. 构建慢或拉镜像超时

- `Dockerfile` 默认使用 `docker.m.daocloud.io/library/node:20-bookworm-slim` 镜像加速  
- worker 镜像因 LibreOffice 较大（约 1.5GB+），首次构建较慢属正常  
- 可传参：`docker build --build-arg NODE_IMAGE=node:20-bookworm-slim .`

#### 7. 从 Docker 切回本机开发

```bash
docker compose stop api worker          # 释放 3000
docker compose -f docker-compose.dev.yml up -d   # 仅 Redis
pnpm dev
```

#### 8. 新机器验收（阶段六完成标准）

```bash
# 前提：MySQL 可达（本机 3306 或 compose 内 mysql）
cd file_management_backend
docker compose up -d --build
curl http://localhost:3000/health        # {"status":"ok",...}
# 浏览器打开 http://localhost:3000/api-docs
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
