import request from '../utils/request'

import type { LoginResult, RegisterResult, User } from '../types/user'

// 认证相关API
export const authApi = {
  // 用户登录
  async login(data: { username: string; password: string }): Promise<LoginResult> {
    const res = await request.post<LoginResult>('/auth/login', data)
    return res.data
  },
  
  // 用户注册
  async register(data: { username: string; email?: string; password: string }): Promise<RegisterResult> {
    const res = await request.post<RegisterResult>('/auth/register', data)
    return res.data
  },
  
  // 刷新token
  async refreshToken(refreshToken: string): Promise<{ token: string }> {
    const res = await request.post<{ token: string }>('/auth/refresh', { refreshToken })
    return res.data
  },
  
  // 用户登出
  async logout(refreshToken: string): Promise<{ message: string }> {
    const res = await request.post<{ message: string }>('/auth/logout', { refreshToken })
    return res.data
  },
  
  // 获取当前用户信息
  async getCurrentUser(): Promise<User> {
    const res = await request.get<User>('/auth/me')
    return res.data
  }
}

export default request
