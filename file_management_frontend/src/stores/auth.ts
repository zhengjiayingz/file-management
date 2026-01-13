import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

interface User {
  username: string
  token: string
}

export const useAuthStore = defineStore('auth', () => {
  // 状态
  const user = ref<User | null>(null)
  const token = ref<string>('')

  // 计算属性
  const isLoggedIn = computed(() => !!user.value && !!token.value)

  // 从 localStorage 恢复登录状态
  const initAuth = () => {
    const savedUser = localStorage.getItem('user')
    const savedToken = localStorage.getItem('token')
    
    if (savedUser && savedToken) {
      try {
        user.value = JSON.parse(savedUser)
        token.value = savedToken
      } catch (error) {
        // 如果解析失败，清除无效数据
        localStorage.removeItem('user')
        localStorage.removeItem('token')
      }
    }
  }

  // 登录
  const login = (userData: User) => {
    user.value = userData
    token.value = userData.token
    
    // 保存到 localStorage
    localStorage.setItem('user', JSON.stringify(userData))
    localStorage.setItem('token', userData.token)
  }

  // 退出登录
  const logout = () => {
    console.log('Auth Store: 开始退出登录')
    console.log('Auth Store: 退出前用户:', user.value)
    console.log('Auth Store: 退出前token:', token.value)
    
    user.value = null
    token.value = ''
    
    // 清除 localStorage
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    
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

  return {
    user,
    token,
    isLoggedIn,
    initAuth,
    login,
    logout,
    updateUser
  }
})