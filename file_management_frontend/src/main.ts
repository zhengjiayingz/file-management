import { createApp } from 'vue'
import { createPinia } from 'pinia'

import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'katex/dist/katex.min.css'
// 文件列表：多色文件类型图标（iconfont Symbol，见 components/FileTypeColoredIcon）
import '@/assets/icons/file-types/file-type-icons.js'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'

import i18n from './locales'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(i18n)

// 初始化认证状态
const authStore = useAuthStore()
authStore.initAuth()

// iconfont.js 用 setTimeout(0) 注入 SVG 精灵，延后 mount 避免首屏 <use href="#icon-..."> 找不到符号
setTimeout(() => {
  app.mount('#app')
}, 0)
