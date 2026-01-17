import axios from 'axios'

// 创建axios实例
const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    // 从localStorage获取token
    const token = localStorage.getItem('token')
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
api.interceptors.response.use(
  (response) => {
    return response.data
  },
  async (error) => {
    const originalRequest = error.config
    
    // 如果是401错误且不是刷新token的请求
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      
      try {
        // 尝试刷新token
        const refreshToken = localStorage.getItem('refreshToken')
        if (refreshToken) {
          const response = await axios.post('http://localhost:3000/api/auth/refresh', {
            refreshToken
          })
          
          if (response.data.success) {
            const newToken = response.data.data.accessToken
            localStorage.setItem('token', newToken)
            
            // 重试原请求
            originalRequest.headers.Authorization = `Bearer ${newToken}`
            return api(originalRequest)
          }
        }
      } catch (refreshError) {
        // 刷新失败，清除所有token并跳转到登录页
        localStorage.removeItem('token')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('user')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }
    
    return Promise.reject(error)
  }
)

// 认证相关API
export const authApi = {
  // 用户登录
  login: (data: { username: string; password: string }) => {
    return api.post('/auth/login', data)
  },
  
  // 用户注册
  register: (data: { username: string; email?: string; password: string }) => {
    return api.post('/auth/register', data)
  },
  
  // 刷新token
  refreshToken: (refreshToken: string) => {
    return api.post('/auth/refresh', { refreshToken })
  },
  
  // 用户登出
  logout: (refreshToken: string) => {
    return api.post('/auth/logout', { refreshToken })
  },
  
  // 获取当前用户信息
  getCurrentUser: () => {
    return api.get('/auth/me')
  }
}

export default api