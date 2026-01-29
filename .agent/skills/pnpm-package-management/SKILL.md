---
name: pnpm 包管理助手
description: 使用 pnpm 管理项目依赖，提供快速、高效的包管理方案
---

# pnpm 包管理助手

## 概述
这个技能指导你使用 pnpm 作为项目的包管理器。pnpm 比 npm 更快、更节省磁盘空间，并且能更好地处理依赖关系。

## 使用场景
- 安装项目依赖
- 添加新的依赖包
- 更新依赖版本
- 清理依赖缓存
- 管理工作空间（monorepo）

## 前置条件
- 已安装 Node.js
- 已全局安装 pnpm：`npm install -g pnpm`

## 为什么使用 pnpm？

### 优势
- ⚡ **速度快**：比 npm 和 yarn 快 2-3 倍
- 💾 **节省空间**：使用硬链接和符号链接，避免重复存储
- 🔒 **严格依赖**：避免幽灵依赖（phantom dependencies）
- 📦 **Monorepo 支持**：原生支持工作空间

### 对比
| 特性 | npm | pnpm |
|------|-----|------|
| 安装速度 | 慢 | 快 |
| 磁盘占用 | 高 | 低 |
| 依赖管理 | 扁平化 | 严格隔离 |
| Monorepo | 需配置 | 原生支持 |

## 基本命令

### 安装依赖

#### 安装所有依赖
```bash
pnpm install
# 或简写
pnpm i
```

#### 添加生产依赖
```bash
pnpm add <package-name>

# 示例
pnpm add express
pnpm add swagger-jsdoc swagger-ui-express
```

#### 添加开发依赖
```bash
pnpm add -D <package-name>
# 或
pnpm add --save-dev <package-name>

# 示例
pnpm add -D @types/express
pnpm add -D @types/swagger-jsdoc @types/swagger-ui-express
```

#### 添加全局依赖
```bash
pnpm add -g <package-name>

# 示例
pnpm add -g typescript tsx
```

### 移除依赖

```bash
pnpm remove <package-name>
# 或简写
pnpm rm <package-name>

# 示例
pnpm remove lodash
```

### 更新依赖

```bash
# 更新所有依赖到最新版本
pnpm update

# 更新特定包
pnpm update <package-name>

# 更新到最新版本（包括主版本）
pnpm update --latest
```

### 查看依赖

```bash
# 查看已安装的依赖
pnpm list

# 查看依赖树
pnpm list --depth=1

# 查看过期的依赖
pnpm outdated
```

## 项目迁移

### 从 npm 迁移到 pnpm

#### 1. 删除 npm 相关文件
```bash
# 删除 node_modules
rm -rf node_modules

# 删除 package-lock.json
rm package-lock.json
```

#### 2. 使用 pnpm 安装
```bash
pnpm install
```

这会生成 `pnpm-lock.yaml` 文件。

#### 3. 更新 .gitignore
确保 `.gitignore` 包含：
```
node_modules/
pnpm-lock.yaml  # 或者提交到版本控制
```

### 从 yarn 迁移到 pnpm

```bash
# 删除 yarn 相关文件
rm -rf node_modules
rm yarn.lock

# 使用 pnpm 安装
pnpm install
```

## 常用操作

### 清理缓存
```bash
# 清理 pnpm 缓存
pnpm store prune
```

### 运行脚本
```bash
# 运行 package.json 中定义的脚本
pnpm run dev
pnpm run build
pnpm run test

# 简写（对于常见命令）
pnpm dev
pnpm build
pnpm test
```

### 执行命令
```bash
# 使用项目本地安装的包
pnpm exec <command>

# 示例
pnpm exec prisma migrate dev
pnpm exec tsx scripts/create-admin.ts
```

### 临时运行包（不安装）
```bash
# 类似 npx
pnpm dlx <package-name>

# 示例
pnpm dlx create-vite
pnpm dlx prisma init
```

## Monorepo 工作空间

### 配置工作空间

创建 `pnpm-workspace.yaml`：
```yaml
packages:
  - 'file_management_backend'
  - 'file_management_frontend'
```

### 工作空间命令

```bash
# 在所有工作空间安装依赖
pnpm install

# 在特定工作空间运行命令
pnpm --filter file_management_backend dev
pnpm --filter file_management_frontend build

# 在所有工作空间运行命令
pnpm -r run build
```

## 配置文件

### .npmrc
在项目根目录创建 `.npmrc` 配置 pnpm：

```ini
# 使用严格的对等依赖
strict-peer-dependencies=false

# 设置 shamefully-hoist（如果需要兼容性）
shamefully-hoist=false

# 自动安装对等依赖
auto-install-peers=true

# 设置镜像源（可选）
registry=https://registry.npmmirror.com
```

## 故障排查

### 依赖安装失败

#### 问题：对等依赖冲突
```bash
# 临时解决：允许对等依赖冲突
pnpm install --no-strict-peer-dependencies
```

#### 问题：缓存损坏
```bash
# 清理缓存并重新安装
pnpm store prune
rm -rf node_modules
pnpm install
```

#### 问题：权限错误
```bash
# Windows: 以管理员身份运行
# Linux/Mac: 使用 sudo（不推荐）或修复权限
sudo chown -R $(whoami) ~/.pnpm-store
```

### 幽灵依赖问题

如果项目依赖了未在 `package.json` 中声明的包：

```bash
# 1. 找出问题依赖
pnpm why <package-name>

# 2. 显式添加到 package.json
pnpm add <package-name>
```

## 最佳实践

### ✅ 推荐
- 提交 `pnpm-lock.yaml` 到版本控制
- 使用 `.npmrc` 统一团队配置
- 定期更新依赖：`pnpm update`
- 使用 `pnpm dlx` 代替全局安装
- 在 CI/CD 中使用 `pnpm install --frozen-lockfile`

### ❌ 避免
- 混用 npm/yarn 和 pnpm
- 手动修改 `pnpm-lock.yaml`
- 忽略对等依赖警告
- 使用 `shamefully-hoist=true`（除非必要）

## CI/CD 配置

### GitHub Actions
```yaml
- name: Setup pnpm
  uses: pnpm/action-setup@v2
  with:
    version: 8

- name: Install dependencies
  run: pnpm install --frozen-lockfile
```

### GitLab CI
```yaml
before_script:
  - npm install -g pnpm
  - pnpm install --frozen-lockfile
```

## 快速参考

| 操作 | npm | pnpm |
|------|-----|------|
| 安装依赖 | `npm install` | `pnpm install` |
| 添加依赖 | `npm install pkg` | `pnpm add pkg` |
| 添加开发依赖 | `npm install -D pkg` | `pnpm add -D pkg` |
| 移除依赖 | `npm uninstall pkg` | `pnpm remove pkg` |
| 更新依赖 | `npm update` | `pnpm update` |
| 运行脚本 | `npm run script` | `pnpm run script` |
| 执行命令 | `npx command` | `pnpm dlx command` |
| 清理缓存 | `npm cache clean` | `pnpm store prune` |

## 资源链接

- [pnpm 官方文档](https://pnpm.io/)
- [pnpm vs npm vs yarn](https://pnpm.io/benchmarks)
- [工作空间指南](https://pnpm.io/workspaces)
