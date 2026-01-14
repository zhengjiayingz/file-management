# 状态管理规范

## Pinia 状态管理规范

### Store 文件组织

#### 目录结构
```
src/stores/
├── auth.ts          # 认证状态
├── user.ts          # 用户状态
├── file.ts          # 文件状态
└── index.ts         # 导出所有 stores
```

### Store 定义

#### 使用 Setup Store (推荐)
```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  // State - 使用 ref
  const user = ref<User | null>(null)
  const token = ref<string>('')
  const isLoading = ref(false)

  // Getters - 使用 computed
  const isLoggedIn = computed(() => !!user.value && !!token.value)
  const userName = computed(() => user.value?.username || '')

  // Actions - 使用函数
  const login = async (credentials: LoginCredentials) => {
    isLoading.value = true
    try {
      const response = await api.login(credentials)
      user.value = response.user
      token.value = response.token
      saveToLocalStorage()
    } catch (error) {
      console.error('Login failed:', error)
      throw error
    } finally {
      isLoading.value = false
    }
  }

  const logout = () => {
    user.value = null
    token.value = ''
    clearLocalStorage()
  }

  // 辅助函数
  const saveToLocalStorage = () => {
    localStorage.setItem('user', JSON.stringify(user.value))
    localStorage.setItem('token', token.value)
  }

  const clearLocalStorage = () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
  }

  const initAuth = () => {
    const savedUser = localStorage.getItem('user')
    const savedToken = localStorage.getItem('token')
    
    if (savedUser && savedToken) {
      try {
        user.value = JSON.parse(savedUser)
        token.value = savedToken
      } catch (error) {
        clearLocalStorage()
      }
    }
  }

  return {
    // State
    user,
    token,
    isLoading,
    // Getters
    isLoggedIn,
    userName,
    // Actions
    login,
    logout,
    initAuth
  }
})
```

### Store 命名规范

#### Store ID
- 使用 kebab-case: `'auth'`, `'user-profile'`, `'file-list'`
- 简短且描述性

#### Store 函数名
- 使用 `use` 前缀 + PascalCase: `useAuthStore`, `useUserStore`

```typescript
// ✅ 好的命名
export const useAuthStore = defineStore('auth', () => { ... })
export const useUserStore = defineStore('user', () => { ... })
export const useFileStore = defineStore('file', () => { ... })

// ❌ 避免的命名
export const authStore = defineStore('auth', () => { ... })
export const Auth = defineStore('auth', () => { ... })
```

### State 设计

#### State 类型定义
```typescript
// 定义类型
interface User {
  id: number
  username: string
  email?: string
}

interface AuthState {
  user: User | null
  token: string
  isLoading: boolean
}

// 使用类型
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string>('')
  const isLoading = ref<boolean>(false)
  
  return { user, token, isLoading }
})
```

#### State 初始化
```typescript
export const useAuthStore = defineStore('auth', () => {
  // 从 localStorage 初始化
  const user = ref<User | null>(null)
  const token = ref<string>('')

  // 初始化函数
  const initAuth = () => {
    const savedUser = localStorage.getItem('user')
    const savedToken = localStorage.getItem('token')
    
    if (savedUser && savedToken) {
      try {
        user.value = JSON.parse(savedUser)
        token.value = savedToken
      } catch (error) {
        console.error('Failed to parse saved auth data:', error)
      }
    }
  }

  // 自动初始化
  initAuth()

  return { user, token, initAuth }
})
```

### Getters 设计

#### 使用 computed
```typescript
export const useUserStore = defineStore('user', () => {
  const users = ref<User[]>([])
  const currentUserId = ref<number | null>(null)

  // ✅ 简单的 getter
  const userCount = computed(() => users.value.length)

  // ✅ 带逻辑的 getter
  const activeUsers = computed(() => {
    return users.value.filter(user => user.isActive)
  })

  // ✅ 依赖其他 getter
  const activeUserCount = computed(() => activeUsers.value.length)

  // ✅ 带参数的 getter (返回函数)
  const getUserById = computed(() => {
    return (id: number) => users.value.find(user => user.id === id)
  })

  return {
    users,
    userCount,
    activeUsers,
    activeUserCount,
    getUserById
  }
})
```

### Actions 设计

#### 异步 Actions
```typescript
export const useFileStore = defineStore('file', () => {
  const files = ref<File[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // ✅ 异步 action
  const fetchFiles = async () => {
    isLoading.value = true
    error.value = null
    
    try {
      const response = await api.getFiles()
      files.value = response.data
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取文件失败'
      console.error('Fetch files error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // ✅ 带参数的 action
  const uploadFile = async (file: File) => {
    isLoading.value = true
    error.value = null
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const response = await api.uploadFile(formData)
      files.value.push(response.data)
      
      return response.data
    } catch (err) {
      error.value = err instanceof Error ? err.message : '上传失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    files,
    isLoading,
    error,
    fetchFiles,
    uploadFile
  }
})
```

#### 同步 Actions
```typescript
export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>([])

  // ✅ 同步 action
  const addItem = (item: CartItem) => {
    const existingItem = items.value.find(i => i.id === item.id)
    
    if (existingItem) {
      existingItem.quantity += item.quantity
    } else {
      items.value.push(item)
    }
  }

  const removeItem = (itemId: number) => {
    const index = items.value.findIndex(i => i.id === itemId)
    if (index > -1) {
      items.value.splice(index, 1)
    }
  }

  const clearCart = () => {
    items.value = []
  }

  return {
    items,
    addItem,
    removeItem,
    clearCart
  }
})
```

### Store 组合

#### 在 Store 中使用其他 Store
```typescript
export const useOrderStore = defineStore('order', () => {
  const orders = ref<Order[]>([])
  
  // 使用其他 store
  const authStore = useAuthStore()
  const cartStore = useCartStore()

  const createOrder = async () => {
    // 检查登录状态
    if (!authStore.isLoggedIn) {
      throw new Error('请先登录')
    }

    // 使用购物车数据
    const items = cartStore.items
    
    const order = await api.createOrder({
      userId: authStore.user!.id,
      items
    })

    orders.value.push(order)
    cartStore.clearCart()
    
    return order
  }

  return {
    orders,
    createOrder
  }
})
```

### 持久化

#### 使用 localStorage
```typescript
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string>('')

  // 保存到 localStorage
  const saveToStorage = () => {
    localStorage.setItem('user', JSON.stringify(user.value))
    localStorage.setItem('token', token.value)
  }

  // 从 localStorage 加载
  const loadFromStorage = () => {
    const savedUser = localStorage.getItem('user')
    const savedToken = localStorage.getItem('token')
    
    if (savedUser && savedToken) {
      try {
        user.value = JSON.parse(savedUser)
        token.value = savedToken
      } catch (error) {
        clearStorage()
      }
    }
  }

  // 清除 localStorage
  const clearStorage = () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
  }

  // 登录时保存
  const login = (userData: User, userToken: string) => {
    user.value = userData
    token.value = userToken
    saveToStorage()
  }

  // 登出时清除
  const logout = () => {
    user.value = null
    token.value = ''
    clearStorage()
  }

  // 初始化时加载
  loadFromStorage()

  return {
    user,
    token,
    login,
    logout
  }
})
```

### Store 在组件中的使用

#### 基本使用
```vue
<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

// 访问 state
console.log(authStore.user)
console.log(authStore.token)

// 访问 getters
console.log(authStore.isLoggedIn)

// 调用 actions
const handleLogin = async () => {
  await authStore.login({ username, password })
}
</script>

<template>
  <div v-if="authStore.isLoggedIn">
    欢迎，{{ authStore.user?.username }}
  </div>
</template>
```

#### 解构使用 (需要 storeToRefs)
```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

// ✅ 使用 storeToRefs 保持响应性
const { user, token, isLoggedIn } = storeToRefs(authStore)

// ✅ actions 可以直接解构
const { login, logout } = authStore

// ❌ 直接解构 state 会失去响应性
// const { user, token } = authStore
</script>

<template>
  <div v-if="isLoggedIn">
    欢迎，{{ user?.username }}
  </div>
</template>
```

### 错误处理

#### Store 中的错误处理
```typescript
export const useFileStore = defineStore('file', () => {
  const files = ref<File[]>([])
  const error = ref<string | null>(null)
  const isLoading = ref(false)

  const fetchFiles = async () => {
    isLoading.value = true
    error.value = null
    
    try {
      const response = await api.getFiles()
      files.value = response.data
    } catch (err) {
      // 设置错误信息
      error.value = err instanceof Error ? err.message : '获取文件失败'
      
      // 记录错误
      console.error('Fetch files error:', err)
      
      // 重新抛出错误，让组件处理
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 清除错误
  const clearError = () => {
    error.value = null
  }

  return {
    files,
    error,
    isLoading,
    fetchFiles,
    clearError
  }
})
```

### 最佳实践

#### 1. Store 职责单一
每个 Store 只管理相关的状态

```typescript
// ✅ 好的做法
useAuthStore()  // 只管理认证
useUserStore()  // 只管理用户信息
useFileStore()  // 只管理文件

// ❌ 避免
useAppStore()   // 管理所有状态
```

#### 2. 避免直接修改 State
通过 Actions 修改状态

```typescript
// ✅ 好的做法
const authStore = useAuthStore()
authStore.login(credentials)

// ❌ 避免
authStore.user = newUser
authStore.token = newToken
```

#### 3. 使用 TypeScript
为 State、Getters、Actions 提供类型

```typescript
interface User {
  id: number
  username: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  
  const login = async (credentials: LoginCredentials): Promise<void> => {
    // ...
  }
  
  return { user, login }
})
```

#### 4. 合理使用 Getters
避免过度使用 Getters

```typescript
// ✅ 需要计算的使用 getter
const activeUsers = computed(() => {
  return users.value.filter(u => u.isActive)
})

// ❌ 简单的值不需要 getter
const userName = computed(() => user.value?.name)  // 直接用 user.name
```

#### 5. Actions 返回值
异步 Actions 应该返回 Promise

```typescript
// ✅ 返回 Promise
const fetchData = async (): Promise<Data> => {
  const response = await api.getData()
  return response.data
}

// 组件中可以 await
const data = await store.fetchData()
```

#### 6. 错误处理
在 Store 中捕获错误，在组件中处理

```typescript
// Store
const fetchData = async () => {
  try {
    // ...
  } catch (error) {
    console.error('Error:', error)
    throw error  // 重新抛出
  }
}

// 组件
try {
  await store.fetchData()
  ElMessage.success('成功')
} catch (error) {
  ElMessage.error('失败')
}
```
