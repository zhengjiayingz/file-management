import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/index/index.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/login/index.vue')
    },

    {
      path: '/recycle-bin',
      name: 'recycle-bin',
      component: () => import('../views/recycle-bin/index.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('../views/logs/index.vue'),
      meta: { requiresAuth: true }
    }
  ]
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  
  console.log('🟢 [路由守卫] 从', from.path, '到', to.path)
  console.log('🟢 [路由守卫] requiresAuth:', to.meta.requiresAuth)
  console.log('🟢 [路由守卫] isLoggedIn:', authStore.isLoggedIn)
  console.log('🟢 [路由守卫] token:', authStore.token)
  console.log('🟢 [路由守卫] user:', authStore.user)
  
  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    console.log('🔴 [路由守卫] 未登录,重定向到登录页')
    next('/login')
  } else {
    console.log('✅ [路由守卫] 允许访问')
    next()
  }
})

export default router