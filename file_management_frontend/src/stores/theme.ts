import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type ThemeMode = 'light' | 'dark' | 'auto'

export const useThemeStore = defineStore('theme', () => {
  // 从 localStorage 读取用户设置，默认为 'auto'
  const themeMode = ref<ThemeMode>((localStorage.getItem('themeMode') as ThemeMode) || 'auto')
  
  // 当前实际应用的主题（light 或 dark）
  const currentTheme = ref<'light' | 'dark'>('light')

  // 检测系统主题偏好
  const getSystemTheme = (): 'light' | 'dark' => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
    return 'light'
  }

  // 应用主题到 DOM
  const applyTheme = (theme: 'light' | 'dark') => {
    currentTheme.value = theme
    
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  // 更新主题
  const updateTheme = () => {
    let targetTheme: 'light' | 'dark'
    
    if (themeMode.value === 'auto') {
      targetTheme = getSystemTheme()
    } else {
      targetTheme = themeMode.value
    }
    
    applyTheme(targetTheme)
  }

  // 设置主题模式
  const setThemeMode = (mode: ThemeMode) => {
    themeMode.value = mode
    localStorage.setItem('themeMode', mode)
    updateTheme()
  }

  // 监听系统主题变化（仅在 auto 模式下）
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', () => {
      if (themeMode.value === 'auto') {
        updateTheme()
      }
    })
  }

  // 初始化主题
  updateTheme()

  return {
    themeMode,
    currentTheme,
    setThemeMode,
    updateTheme
  }
})
