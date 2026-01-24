import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

interface User {
  id: number
  username: string
  email?: string
  role: string
  storage_quota: number
  storage_used: number
}

interface LoginData {
  token: string
  refreshToken: string
  user: User
}

export const useAuthStore = defineStore('auth', () => {
  // 状态
  const user = ref<User | null>(null)
  const token = ref<string>('')
  const refreshToken = ref<string>('')

  // 计算属性
  const isLoggedIn = computed(() => !!user.value && !!token.value)

  // 从 localStorage 恢复登录状态
  const initAuth = () => {
    const savedUser = localStorage.getItem('user')
    const savedToken = localStorage.getItem('token')
    const savedRefreshToken = localStorage.getItem('refreshToken')
    
    if (savedUser && savedToken && savedRefreshToken) {
      try {
        user.value = JSON.parse(savedUser)
        token.value = savedToken
        refreshToken.value = savedRefreshToken
      } catch (error) {
        // 如果解析失败，清除无效数据
        localStorage.removeItem('user')
        localStorage.removeItem('token')
        localStorage.removeItem('refreshToken')
      }
    }
  }

  // 登录
  const login = (loginData: LoginData) => {
    user.value = loginData.user
    token.value = loginData.token
    refreshToken.value = loginData.refreshToken
    
    // 保存到 localStorage
    localStorage.setItem('user', JSON.stringify(loginData.user))
    localStorage.setItem('token', loginData.token)
    localStorage.setItem('refreshToken', loginData.refreshToken)
  }

  // 退出登录
  const logout = () => {
    console.log('Auth Store: 开始退出登录')
    console.log('Auth Store: 退出前用户:', user.value)
    console.log('Auth Store: 退出前token:', token.value)
    
    user.value = null
    token.value = ''
    refreshToken.value = ''
    
    // 清除 localStorage
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    
    console.log('Auth Store: 退出后用户:', user.value)
    console.log('Auth Store: 退出后token:', token.value)
    console.log('Auth Store: localStorage已清除')
  }

  // 更新用户信息
  const updateUser = (userData: Partial<User>) => {
    if (user.value) {
      user.value = { ...user.value, ...userData }
      localStorage.setItem('user', JSON.stringify(user.value))
    }
  }

  // 更新token
  const updateToken = (newToken: string) => {
    token.value = newToken
    localStorage.setItem('token', newToken)
  }

  return {
    user,
    token,
    refreshToken,
    isLoggedIn,
    initAuth,
    login,
    logout,
    updateUser,
    updateToken
  }
})

