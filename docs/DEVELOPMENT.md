# 本地开发与工程维护

> **最后更新**：2026-04-20  
> **范围**：仓库内前后端目录、`Prisma` 与常见环境问题；需求与验收仍以 [REQUIREMENTS.md](./REQUIREMENTS.md) 为准。

---

## 1. 仓库结构（摘录）

| 路径 | 说明 |
|------|------|
| `file_management_backend/` | Express API、**`prisma/schema.prisma`**、Swagger `/api-docs` |
| `file_management_frontend/` | Vite + Vue 3 前端 |

---

## 2. Prisma Client 与 `schema` 同步

- **唯一来源**：`file_management_backend/prisma/schema.prisma` 经 `prisma generate` 生成类型与查询引擎到 `node_modules/.prisma/client`（由 `@prisma/client` 引用）。
- **修改 schema 或首次克隆后**须生成 Client，否则 TypeScript 类型与运行时可能不一致。

### 2.1 推荐命令

在 **`file_management_backend`** 目录下：

```bash
npm run prisma:generate
# 等价于 npx prisma generate
```

### 2.2 已配置的自动化（`package.json`）

| 脚本 | 行为 |
|------|------|
| **`postinstall`** | `npm install` 结束后执行 **`prisma generate`**，减少「忘生成」导致的类型滞后。 |
| **`build`** | **`prisma generate && tsc`**，保证生产构建前 Client 与 schema 一致。 |
| **`dev`** | `tsx watch` 启动开发服务（不自动跑 generate；改 schema 后请自行执行上表命令）。 |

---

## 3. Windows：`EPERM` 与 `query_engine-windows.dll.node`

若出现：

```text
EPERM: operation not permitted, rename '...\query_engine-windows.dll.node.tmp...' -> '...\query_engine-windows.dll.node'
```

说明 **已有进程加载了 Prisma 查询引擎**（常见为本项目的 **`npm run dev`** / `tsx watch`）。

**处理步骤**：

1. 停止 `file_management_backend` 的 **`npm run dev`**（及占用该目录 Node 的其它终端）。
2. 再执行 **`npx prisma generate`**（或 `npm run prisma:generate`）。
3. 仍偶发时：检查杀毒软件是否实时扫描 `node_modules\.prisma`，可将该路径加入排除项。

---

## 4. TypeScript 与 IDE

- **以命令行为准**：在 `file_management_backend` 下执行 **`npx tsc --noEmit`** 应无报错（在已成功 `prisma generate` 的前提下）。
- 若 **Cursor / VS Code** 仍对 `User`、`UserSelect`、`UserUpdateInput` 等报与 `schema` 不符的红线，多为语言服务缓存：在已成功生成 Client 后执行 **「TypeScript: Restart TS Server」**，或确认工作区打开的是包含 **`file_management_backend/node_modules`** 的工程根目录。

---

## 5. 环境变量与接口文档

- 后端：在 **`file_management_backend/.env`** 配置 `DATABASE_URL`、`JWT_SECRET` 等（勿提交密钥）。
- **API 说明**：启动后端后访问 [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) 中的 Swagger 地址（默认 `http://localhost:3000/api-docs`）。

---

## 6. 相关文档

| 文档 | 用途 |
|------|------|
| [DATABASE_DESIGN.md](./DATABASE_DESIGN.md) | 表结构与字段说明（与 Prisma schema 对齐） |
| [BUSINESS_FLOWS.md](./BUSINESS_FLOWS.md) | 业务流程与表操作 |
| [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) | Swagger 使用与常见问题 |
| [PROGRESS_REPORT.md](./PROGRESS_REPORT.md) / [UNFINISHED_REQUIREMENTS.md](./UNFINISHED_REQUIREMENTS.md) | 需求进度与未完项 |
