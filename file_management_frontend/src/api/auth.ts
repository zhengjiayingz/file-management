import request from '../utils/request'

// 认证相关API
export const authApi = {
  // 用户登录
  login: (data: { username: string; password: string }) => {
    return request.post('/auth/login', data).then(res => res.data)
  },
  
  // 用户注册
  register: (data: { username: string; email?: string; password: string }) => {
    return request.post('/auth/register', data).then(res => res.data)
  },
  
  // 刷新token
  refreshToken: (refreshToken: string) => {
    return request.post('/auth/refresh', { refreshToken }).then(res => res.data)
  },
  
  // 用户登出
  logout: (refreshToken: string) => {
    return request.post('/auth/logout', { refreshToken }).then(res => res.data)
  },
  
  // 获取当前用户信息
  getCurrentUser: () => {
    return request.get('/auth/me').then(res => res.data)
  }
}

export default request
