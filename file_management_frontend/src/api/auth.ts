import request from '@utils/request'

import type { LoginResult, RegisterResult, User, UserRole } from '@typing/user'

function mapAuthUser(backendUser: {
  id: number
  username: string
  email: string | null
  role: UserRole
  storage_quota: number
  storage_used: number
  must_change_password?: boolean
  avatar_url?: string | null
  vip_expire_at?: string | null
  created_at?: string
}): User {
  return {
    id: backendUser.id,
    username: backendUser.username,
    email: backendUser.email,
    role: backendUser.role,
    storageQuota: backendUser.storage_quota,
    storageUsed: backendUser.storage_used,
    createdAt: backendUser.created_at ?? new Date().toISOString(),
    mustChangePassword: Boolean(backendUser.must_change_password),
    avatar: backendUser.avatar_url ?? undefined,
    vipExpireAt: backendUser.vip_expire_at ?? null,
  }
}

// 认证相关API
export const authApi = {
  /** 会话达上限时后端返回的列表项 */
  async login(data: {
    username: string
    password: string
    /** 踢掉指定 refresh_token 记录后再登录 */
    revokeSessionId?: number
  }): Promise<LoginResult> {
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
          must_change_password?: boolean;
          avatar_url?: string | null;
          vip_expire_at?: string | null;
          created_at?: string;
        };
        accessToken: string;
        refreshToken: string;
      }
    }>('/auth/login', data)

    const backendUser = res.data.data.user
    return {
      message: '登录成功',
      user: mapAuthUser(backendUser),
      token: res.data.data.accessToken,
      refreshToken: res.data.data.refreshToken
    }
  },

  async changePassword(data: { newPassword: string; currentPassword?: string }): Promise<{
    accessToken: string
    user: User
  }> {
    const res = await request.post<{
      success: boolean
      data: {
        accessToken: string
        user: {
          id: number
          username: string
          email: string | null
          role: UserRole
          storage_quota: number
          storage_used: number
          must_change_password: boolean
        }
      }
    }>('/auth/change-password', data)

    const u = res.data.data.user
    return {
      accessToken: res.data.data.accessToken,
      user: {
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        storageQuota: u.storage_quota,
        storageUsed: u.storage_used,
        createdAt: new Date().toISOString(),
        mustChangePassword: Boolean(u.must_change_password)
      }
    }
  },

  // 用户注册
  async register(data: { username: string; email?: string; password: string }): Promise<RegisterResult> {
    const res = await request.post<{
      success: boolean
      data: {
        user: {
          id: number
          username: string
          email: string | null
          role: UserRole
          storage_quota: number
          storage_used: number
          must_change_password?: boolean
          avatar_url?: string | null
          vip_expire_at?: string | null
          created_at?: string
        }
        accessToken: string
        refreshToken: string
      }
    }>('/auth/register', data)
    return {
      message: '注册成功',
      user: mapAuthUser(res.data.data.user),
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

  /** 忘记密码：通知管理员（需填写用户名） */
  async forgotPassword(data: { username: string }): Promise<{ message: string }> {
    const res = await request.post<{ success: boolean; message: string }>('/auth/forgot-password', data)
    return { message: res.data.message }
  },

  /** 活跃会话列表（可选传 refreshToken 以标记本机会话 id） */
  async listSessions(refreshToken?: string): Promise<{
    sessions: Array<{
      id: number
      ipAddress: string
      userAgent: string | null
      deviceName: string | null
      deviceType: string | null
      createdAt: string
      lastUsedAt: string | null
    }>
    currentSessionId: number | null
  }> {
    const res = await request.post<{
      success: boolean
      data: {
        sessions: Array<{
          id: number
          ipAddress: string
          userAgent: string | null
          deviceName: string | null
          deviceType: string | null
          createdAt: string
          lastUsedAt: string | null
        }>
        currentSessionId: number | null
      }
    }>('/auth/sessions/list', { refreshToken: refreshToken ?? undefined })
    return res.data.data
  },

  /** 登出所选设备（撤销 refresh 并递增 session_version） */
  async revokeSessions(ids: number[], refreshToken: string): Promise<void> {
    await request.post<{ success: boolean }>('/auth/sessions/revoke', { ids, refreshToken })
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
        must_change_password?: boolean;
        created_at: string;
        avatar_url?: string | null;
        vip_expire_at?: string | null;
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
      createdAt: backendUser.created_at,
      mustChangePassword: Boolean(backendUser.must_change_password),
      avatar: backendUser.avatar_url ?? undefined,
      vipExpireAt: backendUser.vip_expire_at ?? null,
    }
  }
}

export default request
