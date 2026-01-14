import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import LoginView from '../views/login/index.vue'
import IndexView from '../views/index/index.vue'
import TestView from '../views/test/index.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { requiresGuest: true }
    },
    {
      path: '/',
      name: 'index',
      component: IndexView,
      meta: { requiresAuth: true }
    },
    {
      path: '/test',
      name: 'test',
      component: TestView
    },
    {
      path: '/home',
      redirect: '/'
    }
  ]
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  
  // 初始化认证状态（从 localStorage 恢复）
  authStore.initAuth()
  
  const isLoggedIn = authStore.isLoggedIn
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)
  const requiresGuest = to.matched.some(record => record.meta.requiresGuest)
  
  if (requiresAuth && !isLoggedIn) {
    // 需要登录但未登录，跳转到登录页
    next('/login')
  } else if (requiresGuest && isLoggedIn) {
    // 已登录用户访问登录页，跳转到首页
    next('/')
  } else {
    // 正常访问
    next()
  }
})

export default router
