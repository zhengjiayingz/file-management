---
name: nest-backend-conventions
description: >-
  NestJS 后端目录组织、import 路径别名（@/）与 ESLint 修复规范。适用于
  file_management_backend_nest 及同类 Nest 迁移/新模块开发；在用户要求按项目规范组织代码、
  配置路径别名、修复 ESLint、或新增 auth/files/user 等功能模块时使用。
---

# Nest 后端项目规范

本规范源自 `file_management_backend_nest` 实践。新增或重构代码时**默认遵循**。

## 1. 模块内目录组织

**原则：在模块内按功能分子目录，不要**在 `src/` 根下建全局 `controllers/`、`services/`。

### 标准布局

```
src/
├── auth/
│   ├── controllers/          # 路由层（单 controller 也放这里）
│   ├── services/               # 业务逻辑（auth / password / mfa / session）
│   ├── dto/
│   ├── guards/
│   ├── types/
│   └── auth.module.ts          # *.module.ts 留在模块根目录
├── files/
│   ├── query/                  # 读：列表、下载、预览
│   ├── manage/                 # 写：删除、恢复、移动、重命名
│   ├── tag/                    # 标签 CRUD
│   ├── helpers/                # 模块内共享 helper
│   ├── utils/
│   └── files.module.ts
├── user/
│   ├── controllers/
│   ├── services/
│   └── user.module.ts
├── common/                     # 跨模块：guards、decorators、filters
├── prisma/
└── app.module.ts
```

### 规则

| 规则 | 说明 |
|------|------|
| 功能域一对文件 | 每个子目录放 `*.controller.ts` + `*.service.ts`（如 `query/`、`manage/`） |
| 单 controller 模块 | `controllers/` + `services/` 分离（如 `auth/`、`user/`） |
| 共享逻辑 | `helpers/`、`utils/`、`dto/`、`guards/` 等同模块内平级目录 |
| Module 注册 | `*.module.ts` 在模块根目录，import 子目录中的 controller/service |
| 路由顺序 | 静态路由（如 `tags`）的 Controller **先于** 带 `:id` 的 Controller 注册 |

### 新增功能示例

上传 → `files/upload/`；Office 预览 → `files/preview/`。不要堆在模块根目录。

---

## 2. Import 路径规则

### 路径别名 `@/`

`tsconfig.json` 已配置：

```json
"baseUrl": "./",
"paths": {
  "@/*": ["src/*"]
}
```

| 场景 | 写法 |
|------|------|
| 跨模块引用 | `@/prisma/prisma.service`、`@/common/decorators/...` |
| 同模块内引用 | 单层 `../`：`../services/auth.service`、`../helpers/file-batch.helper` |
| **禁止** | 两层及以上 `../../`（一律改为 `@/`） |

```typescript
// ✅ 跨模块
import { PrismaService } from '@/prisma/prisma.service';

// ✅ 同模块子目录
import { FilesQueryService } from './files-query.service';
import { FileBatchHelper } from '../helpers/file-batch.helper';

// ❌ 禁止
import { PrismaService } from '../../prisma/prisma.service';
```

### test 目录

```typescript
// ✅
import { AppModule } from '@/app.module';
import { createE2eApp } from '../helpers/app-bootstrap';  // test 内单层 ../ 允许

// ❌
import { AppModule } from '../../src/app.module';
```

### Jest 配置（必须同步）

`package.json`（单元测试）与 `test/jest-e2e.json`：

```json
"moduleNameMapper": {
  "^@/(.*)$": "<rootDir>/../src/$1"
}
```

单元测试 `rootDir: src` 时用 `"<rootDir>/$1"`。

### ESLint 与别名

`eslint.config.mjs` 须显式指定 tsconfig，否则 `@/` 无法解析会触发 `no-unsafe-*`：

```javascript
parserOptions: {
  project: ['./tsconfig.json', './tsconfig.build.json'],
  tsconfigRootDir: import.meta.dirname,
},
```

---

## 3. ESLint 常见问题与修复

完成改动后运行：

```bash
pnpm exec eslint "{src,test}/**/*.ts"
pnpm build
pnpm test:e2e
```

### `@typescript-eslint/no-base-to-string`

**原因**：对 `unknown` 使用 `String(x)`，对象会变成 `[object Object]`。

**修复**：先收窄类型，再解析。查询参数可复用：

```typescript
function queryString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return '';
}

function queryStringOr(value: unknown, fallback: string): string {
  const s = queryString(value);
  return s || fallback;
}

function parseQueryInt(value: unknown, fallback: number): number {
  if (value == null || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = parseInt(value.trim(), 10);
    return Number.isNaN(n) ? fallback : n;
  }
  return fallback;
}

function tryParseQueryInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() !== '') return parseInt(value.trim(), 10);
  return Number.NaN;
}
```

可将上述函数放入 `src/files/utils/query-params.utils.ts` 等同模块 `utils/` 复用。

### `@typescript-eslint/no-require-imports`

```typescript
// ❌
const x = require('@ffmpeg-installer/ffmpeg');

// ✅
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
```

### `@typescript-eslint/no-unused-vars`

删除未使用的类型/变量；`catch` 不需要变量时用 `catch {`。

### `@typescript-eslint/require-await`

接口要求 `Promise<T>` 但无异步操作时，去掉 `async`，返回 `Promise.resolve(...)`。

### `@typescript-eslint/no-floating-promises`

入口文件：`void bootstrap();`

### `@typescript-eslint/no-unsafe-return`（Proxy）

Proxy `get` 陷阱显式返回 `unknown`，用 `Reflect.get` + 类型断言。

### `no-control-regex`

ZIP 路径等必须匹配控制字符时，单行禁用并注释原因：

```typescript
// eslint-disable-next-line no-control-regex -- zip 路径需剔除控制字符
const s = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
```

### `prettier/prettier`

- 短字符串参数保持单行：`throw new BadRequestException(\`...\`)`
- 长数组/条件换行；优先 `pnpm exec eslint --fix`

### test 中无法解析的模块

测试 setup 用到的包（如 `dotenv`）应加入 `devDependencies`，使用默认 import：

```typescript
import dotenv from 'dotenv';
dotenv.config({ path: nestEnv });
```

---

## 4. 实施检查清单

新增或重构模块时：

```
- [ ] 文件放入正确的功能子目录（query/manage/tag 或 controllers/services）
- [ ] 跨模块 import 使用 @/，同模块最多一层 ../
- [ ] files.module.ts / auth.module.ts 更新 controllers、providers 路径
- [ ] 查询参数解析不用 String(unknown)
- [ ] pnpm exec eslint "{src,test}/**/*.ts" 零错误
- [ ] pnpm build 通过
- [ ] pnpm test:e2e 通过
```

---

## 5. 参考：files.module.ts 注册示例

```typescript
@Module({
  imports: [StorageModule],
  controllers: [
    FilesTagController,    // 静态路由优先
    FilesQueryController,
    FilesManageController,
  ],
  providers: [
    FilesQueryService,
    FilesManageService,
    FilesTagService,
    FileBatchHelper,
    OperationLogService,
    PasswordPolicyService,
  ],
})
export class FilesModule {}
```
