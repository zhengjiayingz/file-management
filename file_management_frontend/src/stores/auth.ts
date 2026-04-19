import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, LoginResult } from '@typing/user'

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
  const login = async (loginData: Omit<LoginResult, 'message'>) => {
    user.value = loginData.user
    token.value = loginData.token
    refreshToken.value = loginData.refreshToken

    // 保存到 localStorage
    localStorage.setItem('user', JSON.stringify(loginData.user))
    localStorage.setItem('token', loginData.token)
    localStorage.setItem('refreshToken', loginData.refreshToken)

    // 临时密码登录时多数接口被拦截，跳过偏好加载，改密成功后再拉取
    if (!loginData.user.mustChangePassword) {
      await loadUserPreferences()
    }
  }

  // 加载用户配置
  const loadUserPreferences = async () => {
    try {
      const { userPreferenceApi } = await import('../api/user-preference')
      const { default: i18n } = await import('../locales')
      const { useThemeStore } = await import('./theme')

      const preferences = await userPreferenceApi.getPreference()

      const themeStore = useThemeStore()

      // 应用语言设置
      if (preferences.locale && preferences.locale !== 'auto') {
        i18n.global.locale.value = preferences.locale as any
        localStorage.setItem('locale', preferences.locale)
      } else {
        // 使用浏览器语言
        const browserLang = navigator.language
        let defaultLocale = 'zh-CN'
        if (browserLang === 'zh-TW' || browserLang === 'zh-HK') {
          defaultLocale = 'zh-TW'
        } else if (browserLang.startsWith('en')) {
          defaultLocale = 'en-US'
        }
        i18n.global.locale.value = defaultLocale as any
        localStorage.setItem('locale', defaultLocale)
      }

      // 应用主题设置
      if (preferences.theme) {
        themeStore.setThemeMode(preferences.theme as any)
      }

    } catch (error) {
      console.error('❌ 加载用户配置失败:', error)
      // 加载失败时使用默认设置（浏览器语言 + auto 主题）
    }
  }

  // 退出登录
  const logout = () => {

    user.value = null
    token.value = ''
    refreshToken.value = ''

    // 清除 localStorage（包括语言和主题设置）
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('locale')  // 清除语言设置
    localStorage.removeItem('themeMode')  // 清除主题设置

    // 注意：不在这里刷新页面，由调用者处理路由跳转
    // 当跳转到登录页时，i18n 会自动检测到没有 token，使用浏览器语言
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

  // 刷新用户信息
  const refreshUserInfo = async () => {
    try {
      const { authApi } = await import('../api/auth')
      const currentUser = await authApi.getCurrentUser()
      if (currentUser) {
        user.value = currentUser
        localStorage.setItem('user', JSON.stringify(currentUser))
      }
    } catch (error) {
      console.error('刷新用户信息失败:', error)
    }
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
    updateToken,
    refreshUserInfo,
    loadUserPreferences
  }
})

