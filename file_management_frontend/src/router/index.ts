import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@stores/auth'

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
      path: '/force-change-password',
      name: 'force-change-password',
      component: () => import('../views/force-change-password/index.vue'),
      meta: { requiresAuth: true }
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
    },
    {
      path: '/transfer-records',
      name: 'transfer-records',
      component: () => import('../views/transfer-records/index.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('../views/admin/index.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/share/:code',
      name: 'share-access',
      component: () => import('../views/share-access/index.vue')
    },
    {
      path: '/share-save/:code',
      name: 'share-save',
      component: () => import('../views/share-save/index.vue'),
      meta: { requiresAuth: true }
    }
  ]
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()

  console.log('🟢 [路由守卫] 从', from.path, '到', to.path)

  const mustChange = authStore.user?.mustChangePassword === true

  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    console.log('🔴 [路由守卫] 未登录,重定向到登录页')
    next({
      path: '/login',
      query: { redirect: to.fullPath }
    })
    return
  }

  if (authStore.isLoggedIn && to.path === '/login') {
    next(mustChange ? '/force-change-password' : '/')
    return
  }

  if (mustChange && to.path !== '/force-change-password') {
    console.log('🔴 [路由守卫] 须先修改临时密码')
    next('/force-change-password')
    return
  }

  if (!mustChange && to.path === '/force-change-password') {
    next('/')
    return
  }

  if (to.meta.requiresAdmin && authStore.user?.role !== 'admin') {
    console.log('🔴 [路由守卫] 非管理员, 拒绝访问')
    next('/')
    return
  }

  console.log('✅ [路由守卫] 允许访问')
  next()
})

export default router