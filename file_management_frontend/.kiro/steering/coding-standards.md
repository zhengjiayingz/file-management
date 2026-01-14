# 前端编码规范

## Vue 3 + TypeScript 编码规范

### 文件命名

#### 组件文件
- 页面组件: `index.vue` (放在以页面名命名的目录下)
- 通用组件: `PascalCase.vue` (例: `UserCard.vue`, `FileList.vue`)
- 布局组件: `*Layout.vue` (例: `MainLayout.vue`)

```
views/
├── login/
│   └── index.vue
├── index/
│   └── index.vue
components/
├── UserCard.vue
├── FileList.vue
```

#### 其他文件
- Store: `*.ts` (例: `auth.ts`, `file.ts`)
- Router: `index.ts`
- 工具函数: `*.util.ts` 或 `*.ts`
- 类型定义: `*.types.ts` 或 `types.ts`
- API: `*.api.ts` (例: `auth.api.ts`)

### 组件结构

#### 单文件组件顺序
```vue
<script setup lang="ts">
// 1. 导入
// 2. Props 定义
// 3. Emits 定义
// 4. 响应式数据
// 5. 计算属性
// 6. 方法
// 7. 生命周期钩子
</script>

<template>
  <!-- 模板内容 -->
</template>

<style scoped>
/* 样式 */
</style>
```

#### 完整示例
```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

// Props
interface Props {
  userId: number
  title?: string
}
const props = withDefaults(defineProps<Props>(), {
  title: '默认标题'
})

// Emits
interface Emits {
  (e: 'update', value: string): void
  (e: 'delete', id: number): void
}
const emit = defineEmits<Emits>()

// 响应式数据
const loading = ref(false)
const data = ref<User[]>([])

// 计算属性
const filteredData = computed(() => {
  return data.value.filter(item => item.isActive)
})

// 方法
const handleUpdate = (value: string) => {
  emit('update', value)
}

// 生命周期
onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="container">
    <h1>{{ title }}</h1>
    <!-- 内容 -->
  </div>
</template>

<style scoped>
.container {
  padding: 20px;
}
</style>
```

### 命名约定

#### 变量命名
- 使用 camelCase: `userName`, `isLoading`
- 布尔值使用 `is/has/can` 前缀: `isActive`, `hasPermission`
- 常量使用 UPPER_SNAKE_CASE: `MAX_SIZE`, `API_BASE_URL`

#### 函数命名
- 使用 camelCase: `getUserInfo`, `handleClick`
- 事件处理函数使用 `handle` 前缀: `handleSubmit`, `handleDelete`
- 获取数据函数使用 `fetch/get` 前缀: `fetchUsers`, `getUserById`

#### 组件命名
- 使用 PascalCase: `UserCard`, `FileList`
- 页面组件可以使用 `*View` 后缀: `LoginView`, `IndexView`

### TypeScript 类型定义

#### 接口定义
```typescript
// 定义接口
interface User {
  id: number
  username: string
  email?: string
}

// 使用接口
const user = ref<User | null>(null)
const users = ref<User[]>([])
```

#### Props 类型
```typescript
interface Props {
  userId: number
  title?: string
  items: string[]
}

const props = defineProps<Props>()
```

#### Emits 类型
```typescript
interface Emits {
  (e: 'update', value: string): void
  (e: 'delete', id: number): void
}

const emit = defineEmits<Emits>()
```

### 响应式数据

#### ref vs reactive
```typescript
// ✅ 基本类型使用 ref
const count = ref(0)
const name = ref('')
const isActive = ref(false)

// ✅ 对象使用 reactive
const form = reactive({
  username: '',
  password: ''
})

// ✅ 数组使用 ref
const items = ref<Item[]>([])
```

#### 访问响应式数据
```typescript
// ref 需要 .value
const count = ref(0)
console.log(count.value)

// reactive 直接访问
const form = reactive({ name: '' })
console.log(form.name)

// 模板中都不需要 .value
<template>
  <div>{{ count }}</div>
  <div>{{ form.name }}</div>
</template>
```

### 计算属性

#### 使用 computed
```typescript
// ✅ 只读计算属性
const fullName = computed(() => {
  return `${firstName.value} ${lastName.value}`
})

// ✅ 可写计算属性
const fullName = computed({
  get: () => `${firstName.value} ${lastName.value}`,
  set: (value) => {
    const parts = value.split(' ')
    firstName.value = parts[0]
    lastName.value = parts[1]
  }
})
```

### 生命周期钩子

#### 常用钩子
```typescript
import { onMounted, onUnmounted, onBeforeMount } from 'vue'

onBeforeMount(() => {
  console.log('组件挂载前')
})

onMounted(() => {
  console.log('组件已挂载')
  fetchData()
})

onUnmounted(() => {
  console.log('组件卸载')
  cleanup()
})
```

### 组件通信

#### Props 传递
```vue
<!-- 父组件 -->
<UserCard :user="currentUser" :show-actions="true" />

<!-- 子组件 -->
<script setup lang="ts">
interface Props {
  user: User
  showActions?: boolean
}
const props = defineProps<Props>()
</script>
```

#### Emits 事件
```vue
<!-- 子组件 -->
<script setup lang="ts">
const emit = defineEmits<{
  (e: 'update', value: string): void
}>()

const handleUpdate = () => {
  emit('update', 'new value')
}
</script>

<!-- 父组件 -->
<UserCard @update="handleUpdate" />
```

#### Provide/Inject
```typescript
// 父组件
import { provide } from 'vue'
provide('theme', 'dark')

// 子组件
import { inject } from 'vue'
const theme = inject<string>('theme', 'light')
```

### 路由使用

#### 编程式导航
```typescript
import { useRouter } from 'vue-router'

const router = useRouter()

// 跳转
router.push('/login')
router.push({ name: 'user', params: { id: 123 } })

// 替换
router.replace('/home')

// 返回
router.back()
router.go(-1)
```

#### 路由参数
```typescript
import { useRoute } from 'vue-router'

const route = useRoute()

// 获取参数
const userId = route.params.id
const query = route.query.search
```

### 状态管理 (Pinia)

#### Store 定义
```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUserStore = defineStore('user', () => {
  // State
  const user = ref<User | null>(null)
  const token = ref('')

  // Getters
  const isLoggedIn = computed(() => !!user.value && !!token.value)

  // Actions
  const login = (userData: User) => {
    user.value = userData
    token.value = userData.token
  }

  const logout = () => {
    user.value = null
    token.value = ''
  }

  return {
    user,
    token,
    isLoggedIn,
    login,
    logout
  }
})
```

#### Store 使用
```typescript
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

// 访问 state
console.log(userStore.user)

// 访问 getters
console.log(userStore.isLoggedIn)

// 调用 actions
userStore.login(userData)
```

### Element Plus 使用

#### 组件导入
```typescript
// 自动导入（已配置）
<template>
  <el-button type="primary">按钮</el-button>
  <el-input v-model="value" />
</template>

// 手动导入（特殊情况）
import { ElMessage, ElMessageBox } from 'element-plus'

ElMessage.success('操作成功')
ElMessageBox.confirm('确定删除吗？')
```

#### 表单验证
```vue
<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'

const formRef = ref<FormInstance>()

const form = reactive({
  username: '',
  password: ''
})

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' }
  ]
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate()
  // 提交表单
}
</script>

<template>
  <el-form ref="formRef" :model="form" :rules="rules">
    <el-form-item prop="username">
      <el-input v-model="form.username" />
    </el-form-item>
  </el-form>
</template>
```

### 样式规范

#### Scoped 样式
```vue
<style scoped>
/* 组件样式 */
.container {
  padding: 20px;
}

/* 深度选择器 */
:deep(.el-button) {
  margin-right: 10px;
}

/* 插槽选择器 */
:slotted(.custom-class) {
  color: red;
}

/* 全局选择器 */
:global(.global-class) {
  font-size: 14px;
}
</style>
```

#### CSS 变量
```vue
<style scoped>
.container {
  --primary-color: #409eff;
  color: var(--primary-color);
}
</style>
```

### 错误处理

#### Try-Catch
```typescript
const handleSubmit = async () => {
  try {
    loading.value = true
    await api.submitForm(form)
    ElMessage.success('提交成功')
  } catch (error) {
    console.error('Submit error:', error)
    ElMessage.error('提交失败')
  } finally {
    loading.value = false
  }
}
```

### 性能优化

#### 使用 v-show vs v-if
```vue
<!-- 频繁切换使用 v-show -->
<div v-show="isVisible">内容</div>

<!-- 条件很少改变使用 v-if -->
<div v-if="hasPermission">内容</div>
```

#### 列表渲染 key
```vue
<!-- ✅ 使用唯一 key -->
<div v-for="item in items" :key="item.id">
  {{ item.name }}
</div>

<!-- ❌ 避免使用 index -->
<div v-for="(item, index) in items" :key="index">
  {{ item.name }}
</div>
```

#### 懒加载
```typescript
// 路由懒加载
const routes = [
  {
    path: '/user',
    component: () => import('@/views/user/index.vue')
  }
]
```

### 代码格式

#### Prettier 配置
- 缩进: 2 空格
- 引号: 单引号
- 分号: 不使用
- 行尾: LF
- 最大行长: 100 字符

### Git 提交规范

#### 提交信息格式
```
<type>(<scope>): <subject>
```

#### Type 类型
- feat: 新功能
- fix: 修复 bug
- style: 样式调整
- refactor: 重构
- docs: 文档更新
- chore: 构建/工具相关

#### 示例
```
feat(login): 添加记住密码功能
fix(file): 修复文件上传失败问题
style(index): 调整首页布局
```
