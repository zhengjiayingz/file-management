# 项目编码规范总结

## 📚 规范文件位置

### 后端规范 (file_management_backend)
```
file_management_backend/.kiro/steering/
├── coding-standards.md      # TypeScript 编码规范
├── api-design.md           # RESTful API 设计规范
└── database-design.md      # Prisma 数据库设计规范
```

### 前端规范 (file_management_frontend)
```
file_management_frontend/.kiro/steering/
├── coding-standards.md      # Vue 3 + TypeScript 编码规范
├── component-design.md      # 组件设计规范
└── state-management.md      # Pinia 状态管理规范
```

---

## 🎯 规范概览

### 后端规范

#### 1. TypeScript 编码规范
- **文件命名**: `*.controller.ts`, `*.routes.ts`, `*.middleware.ts`
- **变量命名**: camelCase
- **类型定义**: 使用 interface 和 type
- **错误处理**: 统一的 try-catch 和响应格式
- **导入顺序**: Node.js 内置 → 第三方库 → 项目内部

#### 2. API 设计规范
- **RESTful 原则**: 使用标准 HTTP 方法
- **URL 设计**: 名词复数，小写字母
- **响应格式**: 统一的 JSON 结构
- **状态码**: 标准 HTTP 状态码
- **认证**: JWT Bearer Token

#### 3. 数据库设计规范
- **模型命名**: PascalCase 单数 (User, File)
- **字段命名**: camelCase (userId, createdAt)
- **表名映射**: snake_case 复数 (users, files)
- **关系设计**: 明确的外键和级联规则
- **索引策略**: 为外键和常用查询字段添加索引

### 前端规范

#### 1. Vue 3 + TypeScript 编码规范
- **组件命名**: PascalCase.vue
- **页面组件**: index.vue (放在目录下)
- **Props/Emits**: 使用 TypeScript 接口
- **响应式数据**: ref 用于基本类型，reactive 用于对象
- **生命周期**: 使用 Composition API 钩子

#### 2. 组件设计规范
- **单一职责**: 每个组件只负责一个功能
- **组件分类**: 页面/布局/业务/通用组件
- **Props 设计**: 明确的类型定义和默认值
- **插槽使用**: 默认/具名/作用域插槽
- **性能优化**: v-show vs v-if, KeepAlive, 异步组件

#### 3. 状态管理规范
- **Store 组织**: 按功能模块划分
- **Setup Store**: 使用 Composition API 风格
- **State 设计**: 明确的类型定义
- **Getters**: 使用 computed
- **Actions**: 异步操作和错误处理

---

## 🔑 关键规范要点

### 命名规范

#### 后端
```typescript
// 文件
auth.controller.ts
user.routes.ts
auth.middleware.ts

// 变量
const userName = 'John'
const MAX_SIZE = 1024

// 函数
const getUserById = () => {}
const handleLogin = () => {}

// 类型
interface User {}
type Status = 'active' | 'inactive'
```

#### 前端
```typescript
// 文件
UserCard.vue
index.vue
auth.ts

// 变量
const isLoading = ref(false)
const userData = reactive({})

// 函数
const handleClick = () => {}
const fetchUsers = async () => {}

// Store
export const useAuthStore = defineStore('auth', () => {})
```

### 代码组织

#### 后端控制器
```typescript
import { Response } from 'express'
import prisma from '../lib/prisma.js'
import { AuthRequest } from '../types/index.js'

export const getUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany()
    res.json({ success: true, data: users })
  } catch (error) {
    res.status(500).json({ success: false, message: '获取失败' })
  }
}
```

#### 前端组件
```vue
<script setup lang="ts">
// 1. 导入
import { ref, computed, onMounted } from 'vue'

// 2. Props
interface Props {
  userId: number
}
const props = defineProps<Props>()

// 3. 响应式数据
const loading = ref(false)

// 4. 计算属性
const isActive = computed(() => !loading.value)

// 5. 方法
const fetchData = async () => {}

// 6. 生命周期
onMounted(() => {
  fetchData()
})
</script>

<template>
  <div>{{ isActive }}</div>
</template>

<style scoped>
.container { padding: 20px; }
</style>
```

### API 响应格式

#### 成功响应
```json
{
  "success": true,
  "message": "操作成功",
  "data": {
    "id": 1,
    "username": "admin"
  }
}
```

#### 错误响应
```json
{
  "success": false,
  "message": "错误信息",
  "errors": {
    "username": ["用户名已存在"]
  }
}
```

### 数据库模型

#### Prisma Schema
```prisma
model User {
  id        Int      @id @default(autoincrement())
  username  String   @unique @db.VarChar(50)
  email     String?  @db.VarChar(100)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  
  files File[]
  
  @@map("users")
}

model File {
  id        Int      @id @default(autoincrement())
  filename  String   @unique @db.VarChar(255)
  userId    Int      @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
  @@map("files")
}
```

---

## 📖 如何使用这些规范

### 1. Kiro 会自动读取
`.kiro/steering/` 目录下的所有 `.md` 文件会被 Kiro 自动加载，我在工作时会遵循这些规范。

### 2. 团队成员参考
团队成员可以直接阅读这些规范文件，了解项目的编码标准。

### 3. 代码审查
在代码审查时，可以参考这些规范检查代码质量。

### 4. 持续更新
随着项目发展，可以不断更新和完善这些规范。

---

## 🔄 规范更新

如果需要更新规范：

1. 直接编辑 `.kiro/steering/` 目录下的文件
2. Kiro 会在下次对话时自动加载新的规范
3. 通知团队成员规范的变更

---

## 💡 提示

- 规范是指导性的，不是强制性的
- 在特殊情况下可以灵活处理
- 保持规范的简洁和实用性
- 定期回顾和更新规范

---

## 📞 反馈

如果发现规范有问题或需要补充，可以：
1. 直接修改规范文件
2. 在团队会议上讨论
3. 向我提出建议

---

**创建日期**: 2024-01-14
**最后更新**: 2024-01-14
