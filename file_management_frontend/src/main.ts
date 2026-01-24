import { createApp } from 'vue'
import { createPinia } from 'pinia'

import 'element-plus/dist/index.css'
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

app.mount('#app')
