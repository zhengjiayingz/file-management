import request from '../utils/request'

import type { LoginResult, RegisterResult, User, UserRole } from '../types/user'

// 认证相关API
export const authApi = {
  // 用户登录
  async login(data: { username: string; password: string }): Promise<LoginResult> {
    const res = await request.post<{ 
      success: boolean; 
      data: { 
        user: {
          id: number;
          username: string;
          email: string | null;
          role: UserRole;
          storage_quota: number;
          storage_used: number;
        }; 
        accessToken: string; 
        refreshToken: string;
      } 
    }>('/auth/login', data)
    
    // 后端返回 {success, data: {user, accessToken, refreshToken}}
    // 需要映射 accessToken -> token 和 snake_case -> camelCase
    const backendUser = res.data.data.user
    return {
      message: '登录成功',
      user: {
        id: backendUser.id,
        username: backendUser.username,
        email: backendUser.email,
        role: backendUser.role,
        storageQuota: backendUser.storage_quota,
        storageUsed: backendUser.storage_used,
        createdAt: new Date().toISOString() // 后端没返回这个字段,用当前时间
      },
      token: res.data.data.accessToken,
      refreshToken: res.data.data.refreshToken
    }
  },
  
  // 用户注册
  async register(data: { username: string; email?: string; password: string }): Promise<RegisterResult> {
    const res = await request.post<{ success: boolean; data: { user: User; accessToken: string; refreshToken: string } }>('/auth/register', data)
    return {
      message: '注册成功',
      user: res.data.data.user
    }
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
    const res = await request.get<{
      success: boolean;
      data: {
        id: number;
        username: string;
        email: string | null;
        role: UserRole;
        storage_quota: number;
        storage_used: number;
        status: string;
        created_at: string;
      }
    }>('/auth/me')

    const backendUser = res.data.data;
    
    return {
      id: backendUser.id,
      username: backendUser.username,
      email: backendUser.email,
      role: backendUser.role,
      storageQuota: backendUser.storage_quota,
      storageUsed: backendUser.storage_used,
      createdAt: backendUser.created_at
    }
  }
}

export default request
