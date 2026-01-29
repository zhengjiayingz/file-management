---
name: 前端开发助手
description: 指导前端 TypeScript 类型定义、API 封装和 Vue 组件开发规范
---

# 前端开发助手

## 概述
本技能定义了项目中前端开发的标准规范，重点在于 **TypeScript 类型安全** 和 **API 调用模式**。遵循此规范可以显著减少运行时错误，并提供极佳的智能提示体验。

## 1. 类型定义规范 (Type Definitions)

所有数据模型接口必须集中管理，严禁在组件或 API 文件中临时定义。

### 目录结构
- `src/types/common.ts`: 通用类型（分页、标准响应结构）。
- `src/types/<module>.ts`: 业务模块类型（如 `user.ts`, `file.ts`）。

### 编写示例
**src/types/user.ts**
```typescript
// 使用 export interface
export interface User {
  id: number;
  username: string;
  avatar?: string; // 可选字段必须标记
  role: 'admin' | 'user'; // 优先使用联合类型而非 string
}

// 登录响应接口
export interface LoginResult {
  token: string;
  user: User;
}
```

## 2. API 封装规范 (API Service)

API 层必须承担起“类型守门人”的角色。

### 核心原则
1.  **必须**使用 `async/await` 风格，禁止链式 `.then()`。
2.  **必须**显式声明函数返回类型 `Promise<T>`。
3.  **使用泛型** `request.<method><T>()` 来传递类型。

### 标准模版
**src/api/user.ts**
```typescript
import request from '../utils/request'
import type { User, LoginResult } from '../types/user'

export const userApi = {
  // ✅ 标准写法：显式指定 Promise<T>
  async login(data: any): Promise<LoginResult> {
    // request.post<T> 指示 axios 返回结构
    const res = await request.post<LoginResult>('/auth/login', data)
    return res.data // 拦截器通常会返回 data 部分
  },

  // ✅ 标准写法：处理分页
  async getUsers(params: UserQueryParams): Promise<User[]> {
    const res = await request.get<User[]>('/users', { params })
    return res.data
  }
}
```

### ❌ 错误反例
```typescript
// ❌ 缺少返回类型，ide 推断为 Promise<any>
login(data) {
  return request.post('/auth/login', data) // ❌ 混用 return 和 .then
    .then(res => res.data) 
}
```

## 3. Vue 组件开发规范

### 类型导入
使用 `import type` 导入类型，可以使用 `as` 进行别名以避免冲突。

```typescript
<script setup lang="ts">
import { userApi } from '@/api/user'
import type { User as UserInfo } from '@/types/user' // 别名示例

const userList = ref<UserInfo[]>([]) // ✅ 为 ref 指定类型
</script>
```

### 空值安全检查
API 返回的数据中，可选字段（如 `fileSize`, `mimeType`）可能是 `undefined`。在模板或计算属性中使用时必须做空值检查。

```typescript
// ✅ 安全写法
const isImage = (file: FileInfo) => {
  return file.mimeType && file.mimeType.startsWith('image/')
}

// ❌ 危险写法（如果 mimeType 为空会导致运行时崩溃）
const isImage = (file: FileInfo) => {
  return file.mimeType.startsWith('image/')
}
```

## 4. 类型检查工作流
在提交代码前，**必须**运行全量类型检查，因为 IDE 有时会忽略未打开文件的错误。

```bash
# 运行类型检查
pnpm run type-check 
# (通常对应 vue-tsc --noEmit)
```
