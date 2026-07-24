import axios, { type InternalAxiosRequestConfig, type AxiosResponse, AxiosError } from 'axios'
import { useAuthStore } from '@stores/auth'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

/** 弱网 / 无响应 / 网关瞬时错误：最多自动重试次数（不含首次请求，即最多共 1+3 次） */
const MAX_TRANSPORT_RETRIES = 3

type RequestConfigWithRetry = InternalAxiosRequestConfig & {
  _retry?: boolean
  /** 传输层重试计数（与 401 换 token 的 _retry 无关） */
  __transportRetryCount?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 是否值得做传输层重试：无响应；或网关类 5xx（仅对幂等请求重试，避免重复提交） */
function shouldAttemptTransportRetry(error: AxiosError, config: RequestConfigWithRetry): boolean {
  const method = (config.method || 'get').toUpperCase()
  const idempotent = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'

  if (!error.response) {
    return true
  }
  const status = error.response.status
  if (status === 502 || status === 503 || status === 504) {
    return idempotent
  }
  return false
}

// 创建axios实例
const request = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 30000
})

// 是否正在刷新token
let isRefreshing = false
// 请求队列
let requests: Function[] = []

// 处理队列中的请求
const processQueue = (error: Error | null, token: string | null = null) => {
  requests.forEach((cb) => cb(error, token))
  requests = []
}

// 请求拦截器
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 每次请求前获取最新的store（确保在函数内部调用以避免Pinia未初始化问题）
    const authStore = useAuthStore()
    const token = authStore.token

    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  (response: AxiosResponse) => {
    return response
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as RequestConfigWithRetry

    // 弱网 / 超时 / 连接被重置 / 网关 502-504（限幂等）：自动重试，最多 MAX_TRANSPORT_RETRIES 次
    if (originalRequest && shouldAttemptTransportRetry(error, originalRequest)) {
      const count = originalRequest.__transportRetryCount ?? 0
      if (count < MAX_TRANSPORT_RETRIES) {
        originalRequest.__transportRetryCount = count + 1
        const backoffMs = Math.min(2000, 100 * 2 ** count)
        await sleep(backoffMs)
        return request(originalRequest)
      }
    }

    // 如果没有 response (网络错误等)，在重试用尽后 reject
    if (!error.response) {
      return Promise.reject(error)
    }

    const reqUrl = originalRequest.url || ''

    // 登录 / 注册 / 忘记密码 的 401 为业务错误（如账密错误），不得走刷新 Token，否则会 logout + 整页跳转，登录页 Toast 无法展示
    const isPublicAuthFailure =
      reqUrl.includes('auth/login') ||
      reqUrl.includes('auth/register') ||
      reqUrl.includes('auth/forgot-password') ||
      reqUrl.includes('auth/mfa/verify') ||
      /** 登出所选设备时若包含本机 refresh，后端 401 SESSION_REVOKED_SELF；不得走刷新否则会误跳转 */
      reqUrl.includes('auth/sessions/revoke')

    // 如果是 401 错误，且不是刷新 token 的请求本身，也不是未登录类接口的业务 401
    if (
      error.response.status === 401 &&
      !reqUrl.includes('/auth/refresh') &&
      !originalRequest._retry &&
      !isPublicAuthFailure
    ) {
      const authStore = useAuthStore()
      const data = error.response.data as { code?: string } | undefined
      if (data?.code === 'SESSION_REVOKED') {
        processQueue(new Error('Session revoked'), null)
        authStore.logout()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      if (isRefreshing) {
        // 如果正在刷新，将请求加入队列
        return new Promise((resolve, reject) => {
          requests.push((err: Error | null, token: string | null) => {
            if (err) {
              reject(err)
            } else {
              if (token) {
                originalRequest.headers.Authorization = `Bearer ${token}`
              }
              resolve(request(originalRequest))
            }
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const refreshToken = authStore.refreshToken
        if (!refreshToken) {
          throw new Error('No refresh token available')
        }

        // 使用纯 axios 实例发送刷新请求，避免拦截器死循环
        // 注意：这里假设后端刷新接口路径是 /auth/refresh，且参数名为 refreshToken
        // 我们不使用 process.env，而是使用上面定义的 API_BASE_URL
        const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
          refreshToken
        })

        if (response.data.success) {
          const newToken = response.data.data.accessToken

          // 更新 store 和 localStorage
          authStore.updateToken(newToken)

          // 处理队列
          processQueue(null, newToken)

          // 重试当前请求
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return request(originalRequest)
        } else {
          throw new Error('Refresh token failed')
        }
      } catch (refreshError) {
        // 刷新失败，处理队列中的请求都失败
        processQueue(new Error('Token refresh failed'), null)

        // 登出并跳转
        authStore.logout()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    // 刷新 token 时账号被封禁
    if (
      error.response?.status === 403 &&
      originalRequest.url?.includes('/auth/refresh')
    ) {
      const authStore = useAuthStore()
      authStore.logout()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    // 使用临时密码：除白名单外接口返回 MUST_CHANGE_PASSWORD
    if (error.response.status === 403) {
      const body = error.response.data as { code?: string } | undefined
      if (body?.code === 'MUST_CHANGE_PASSWORD') {
        const authStore = useAuthStore()
        authStore.updateUser({ mustChangePassword: true })
        if (!window.location.pathname.includes('/force-change-password')) {
          window.location.href = '/force-change-password'
        }
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  }
)

export default request
