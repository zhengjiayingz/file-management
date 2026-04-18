<template>
  <el-config-provider :locale="elementPlusLocale">
    <div id="app">
      <router-view />
      <FriendPanel />
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElConfigProvider } from 'element-plus'
import { elementPlusLocaleMap } from './locales'
import { useThemeStore } from './stores/theme'
import { useAuthStore } from './stores/auth'
import { useRoute } from 'vue-router'
import FriendPanel from '@/components/FriendPanel/index.vue'

const { locale } = useI18n()
const themeStore = useThemeStore()
const authStore = useAuthStore()
const route = useRoute()

const isLoginPage = computed(() => route.path === '/login')

// 根据当前语言动态获取 Element Plus 语言包
const elementPlusLocale = computed(() => {
  const localeKey = locale.value
  const elLocale = elementPlusLocaleMap[localeKey]
  return elLocale
})

// 监听主题变化，切换 Element Plus 的 dark 类
watch(() => themeStore.currentTheme, (newTheme) => {
  if (newTheme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}, { immediate: true })

onMounted(() => {
  // 确保主题在挂载时正确应用
  themeStore.updateTheme()
})
</script>

<style>
/* 全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
}

#app {
  height: 100%;
}

/* Element Plus 全局样式调整 */
.el-button {
  font-weight: 500;
}

.el-card {
  border-radius: 8px;
}

.el-input__wrapper {
  border-radius: 6px;
}

/* 深色模式变量 */
html.dark {
  color-scheme: dark;
}

/* 自定义深色模式样式 */
html.dark body {
  background-color: #1a1a1a;
  color: #e5e5e5;
}

html.dark .index-container,
html.dark .logs-container,
html.dark .recycle-bin-container {
  background-color: #1a1a1a;
}

html.dark .sidebar {
  background-color: #242424 !important;
  border-right-color: #3a3a3a !important;
}

html.dark .global-header {
  background-color: #242424 !important;
  border-bottom-color: #3a3a3a !important;
}

html.dark .toolbar,
html.dark .filter-bar,
html.dark .table-container {
  background-color: #242424 !important;
  border-color: #3a3a3a !important;
}

html.dark .file-content {
  background-color: #1a1a1a !important;
}

html.dark .content-area {
  background-color: #1a1a1a !important;
}

html.dark .el-dropdown-link,
html.dark .user-dropdown {
  color: #e5e5e5 !important;
}

html.dark .el-dropdown-link:hover,
html.dark .user-dropdown:hover {
  background-color: #3a3a3a !important;
}

html.dark .member-storage-block {
  background-color: #2a2a2a !important;
  border-color: #3a3a3a !important;
}

html.dark .quota-text {
  color: #c0c4cc !important;
}

/* 登录页始终保持浅色模式 */
html.dark .login-container {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  color: #333 !important;
}

html.dark .login-form {
  background: white !important;
  color: #333 !important;
}

html.dark .login-form h1 {
  color: #333 !important;
}

html.dark .login-form .el-input__wrapper {
  background-color: #fff !important;
  box-shadow: 0 0 0 1px #dcdfe6 inset !important;
}

html.dark .login-form .el-input__inner {
  color: #333 !important;
}

html.dark .login-form .el-button--primary {
  background-color: #409eff !important;
  border-color: #409eff !important;
}
</style>
