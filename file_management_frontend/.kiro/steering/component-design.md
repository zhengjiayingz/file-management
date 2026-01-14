# 组件设计规范

## 组件设计原则

### 单一职责原则
每个组件应该只负责一个功能

```vue
<!-- ✅ 好的做法 - 单一职责 -->
<script setup lang="ts">
// UserAvatar.vue - 只负责显示用户头像
</script>

<!-- ❌ 避免 - 职责过多 -->
<script setup lang="ts">
// UserCard.vue - 包含头像、信息、操作按钮、统计数据等
</script>
```

### 组件分类

#### 1. 页面组件 (Page Components)
- 位置: `src/views/`
- 命名: `index.vue` (放在以页面名命名的目录下)
- 职责: 组织布局、调用 API、管理页面状态

```
views/
├── login/
│   └── index.vue
├── index/
│   └── index.vue
├── user/
│   └── index.vue
```

#### 2. 布局组件 (Layout Components)
- 位置: `src/layouts/`
- 命名: `*Layout.vue`
- 职责: 定义页面结构

```vue
<!-- MainLayout.vue -->
<template>
  <div class="main-layout">
    <Header />
    <Sidebar />
    <main class="content">
      <router-view />
    </main>
    <Footer />
  </div>
</template>
```

#### 3. 业务组件 (Business Components)
- 位置: `src/components/business/`
- 命名: `PascalCase.vue`
- 职责: 实现特定业务逻辑

```
components/
├── business/
│   ├── UserCard.vue
│   ├── FileList.vue
│   └── UploadDialog.vue
```

#### 4. 通用组件 (Common Components)
- 位置: `src/components/common/`
- 命名: `PascalCase.vue`
- 职责: 可复用的 UI 组件

```
components/
├── common/
│   ├── Button.vue
│   ├── Modal.vue
│   └── Loading.vue
```

### Props 设计

#### Props 定义
```typescript
// ✅ 使用 TypeScript 接口
interface Props {
  // 必填属性
  userId: number
  title: string
  
  // 可选属性
  subtitle?: string
  showActions?: boolean
  
  // 带默认值
  size?: 'small' | 'medium' | 'large'
  maxItems?: number
}

const props = withDefaults(defineProps<Props>(), {
  size: 'medium',
  maxItems: 10,
  showActions: true
})
```

#### Props 验证
```typescript
// 使用联合类型限制值
interface Props {
  type: 'primary' | 'success' | 'warning' | 'danger'
  size: 'small' | 'medium' | 'large'
}

// 使用枚举
enum ButtonType {
  Primary = 'primary',
  Success = 'success',
  Warning = 'warning',
  Danger = 'danger'
}

interface Props {
  type: ButtonType
}
```

#### Props 命名
```typescript
// ✅ 好的命名
interface Props {
  userId: number          // camelCase
  isActive: boolean       // 布尔值用 is/has/can 前缀
  maxCount: number        // 清晰的名称
  onUpdate: () => void    // 回调函数用 on 前缀
}

// ❌ 避免的命名
interface Props {
  id: number             // 太泛化
  flag: boolean          // 不清晰
  num: number            // 缩写
  callback: () => void   // 不明确
}
```

### Emits 设计

#### Emits 定义
```typescript
// ✅ 使用 TypeScript 接口
interface Emits {
  (e: 'update', value: string): void
  (e: 'delete', id: number): void
  (e: 'change', data: { id: number; value: string }): void
}

const emit = defineEmits<Emits>()
```

#### 事件命名
```typescript
// ✅ 好的命名 - 使用动词
emit('update', value)
emit('delete', id)
emit('submit', form)
emit('cancel')

// ❌ 避免的命名
emit('click')          // 太泛化
emit('data', value)    // 不是动词
emit('onChange', val)  // 不要用 on 前缀
```

#### 事件使用
```vue
<!-- 子组件 -->
<script setup lang="ts">
const emit = defineEmits<{
  (e: 'update', value: string): void
}>()

const handleClick = () => {
  emit('update', 'new value')
}
</script>

<!-- 父组件 -->
<template>
  <ChildComponent @update="handleUpdate" />
</template>
```

### 插槽设计

#### 默认插槽
```vue
<!-- 子组件 -->
<template>
  <div class="card">
    <slot>默认内容</slot>
  </div>
</template>

<!-- 父组件 -->
<template>
  <Card>
    <p>自定义内容</p>
  </Card>
</template>
```

#### 具名插槽
```vue
<!-- 子组件 -->
<template>
  <div class="card">
    <header>
      <slot name="header">默认标题</slot>
    </header>
    <main>
      <slot>默认内容</slot>
    </main>
    <footer>
      <slot name="footer">默认页脚</slot>
    </footer>
  </div>
</template>

<!-- 父组件 -->
<template>
  <Card>
    <template #header>
      <h1>自定义标题</h1>
    </template>
    
    <p>主要内容</p>
    
    <template #footer>
      <button>确定</button>
    </template>
  </Card>
</template>
```

#### 作用域插槽
```vue
<!-- 子组件 -->
<template>
  <div>
    <div v-for="item in items" :key="item.id">
      <slot :item="item" :index="index">
        {{ item.name }}
      </slot>
    </div>
  </div>
</template>

<!-- 父组件 -->
<template>
  <List :items="users">
    <template #default="{ item, index }">
      <div>{{ index }}: {{ item.name }}</div>
    </template>
  </List>
</template>
```

### 组件通信

#### 1. Props / Emits (父子通信)
```vue
<!-- 父组件 -->
<template>
  <Child :value="parentValue" @update="handleUpdate" />
</template>

<!-- 子组件 -->
<script setup lang="ts">
const props = defineProps<{ value: string }>()
const emit = defineEmits<{ (e: 'update', val: string): void }>()
</script>
```

#### 2. Provide / Inject (跨层级通信)
```typescript
// 祖先组件
import { provide } from 'vue'
provide('theme', 'dark')

// 后代组件
import { inject } from 'vue'
const theme = inject<string>('theme', 'light')
```

#### 3. Pinia Store (全局状态)
```typescript
// store
export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  return { user }
})

// 组件
import { useUserStore } from '@/stores/user'
const userStore = useUserStore()
```

### 组件状态管理

#### 本地状态
```typescript
// 只在当前组件使用的状态
const loading = ref(false)
const form = reactive({
  username: '',
  password: ''
})
```

#### 共享状态
```typescript
// 多个组件共享的状态，使用 Pinia
import { useAuthStore } from '@/stores/auth'
const authStore = useAuthStore()
```

### 组件生命周期

#### 常用钩子
```typescript
import { onMounted, onUnmounted, onBeforeMount, onBeforeUnmount } from 'vue'

// 挂载前
onBeforeMount(() => {
  console.log('组件即将挂载')
})

// 挂载后
onMounted(() => {
  console.log('组件已挂载')
  fetchData()
  addEventListeners()
})

// 卸载前
onBeforeUnmount(() => {
  console.log('组件即将卸载')
  cleanup()
})

// 卸载后
onUnmounted(() => {
  console.log('组件已卸载')
  removeEventListeners()
})
```

### 组件复用

#### 组合式函数 (Composables)
```typescript
// useCounter.ts
export function useCounter(initialValue = 0) {
  const count = ref(initialValue)
  
  const increment = () => count.value++
  const decrement = () => count.value--
  const reset = () => count.value = initialValue
  
  return {
    count,
    increment,
    decrement,
    reset
  }
}

// 组件中使用
import { useCounter } from '@/composables/useCounter'

const { count, increment, decrement } = useCounter(10)
```

### 组件性能优化

#### 1. 使用 v-once
```vue
<!-- 只渲染一次，不会更新 -->
<div v-once>{{ staticContent }}</div>
```

#### 2. 使用 v-memo
```vue
<!-- 只在依赖项变化时更新 -->
<div v-memo="[user.id, user.name]">
  {{ user.name }}
</div>
```

#### 3. 异步组件
```typescript
import { defineAsyncComponent } from 'vue'

const AsyncComponent = defineAsyncComponent(() =>
  import('./HeavyComponent.vue')
)
```

#### 4. KeepAlive
```vue
<template>
  <KeepAlive>
    <component :is="currentComponent" />
  </KeepAlive>
</template>
```

### 组件测试

#### 单元测试
```typescript
import { mount } from '@vue/test-utils'
import UserCard from '@/components/UserCard.vue'

describe('UserCard', () => {
  it('renders user name', () => {
    const wrapper = mount(UserCard, {
      props: {
        user: { id: 1, name: 'John' }
      }
    })
    
    expect(wrapper.text()).toContain('John')
  })
})
```

### 组件文档

#### 组件注释
```vue
<script setup lang="ts">
/**
 * 用户卡片组件
 * 
 * @description 显示用户基本信息和操作按钮
 * @example
 * <UserCard :user="currentUser" @edit="handleEdit" />
 */

interface Props {
  /** 用户对象 */
  user: User
  /** 是否显示操作按钮 */
  showActions?: boolean
}
</script>
```

### 最佳实践

#### 1. 保持组件简单
- 单个组件不超过 300 行
- 复杂组件拆分成多个子组件

#### 2. 明确的接口
- Props 和 Emits 使用 TypeScript 类型
- 提供清晰的文档注释

#### 3. 可测试性
- 避免直接操作 DOM
- 使用 Props 和 Emits 而不是全局状态

#### 4. 可维护性
- 使用有意义的命名
- 添加必要的注释
- 保持代码格式一致

#### 5. 性能考虑
- 避免不必要的重新渲染
- 使用 v-show 而不是 v-if (频繁切换)
- 合理使用计算属性和侦听器
