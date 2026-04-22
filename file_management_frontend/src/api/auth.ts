import request from '@utils/request'

import type { LoginFlowResult, LoginResult, RegisterResult, User, UserRole } from '@typing/user'
import { normalizePasswordPolicyClient, type PasswordPolicyClient } from '@utils/passwordStrength'

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
  totp_enabled?: boolean
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
    totpEnabled: Boolean(backendUser.totp_enabled),
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
  }): Promise<LoginFlowResult> {
    const res = await request.post<{
      success: boolean
      code?: string
      message?: string
      data: {
        mfaToken?: string
        expiresIn?: number
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
          totp_enabled?: boolean
        }
        accessToken: string
        refreshToken: string
        password_policy_hint?: string
        password_policy?: PasswordPolicyClient
      }
    }>('/auth/login', data)

    const root = res.data
    if (root.code === 'MFA_REQUIRED' && root.data?.mfaToken) {
      return {
        mfaRequired: true,
        mfaToken: root.data.mfaToken,
        message: root.message
      }
    }

    const backendUser = root.data.user
    const d = root.data
    return {
      mfaRequired: false,
      message: '登录成功',
      user: mapAuthUser(backendUser),
      token: d.accessToken,
      refreshToken: d.refreshToken,
      passwordPolicyHint: d.password_policy_hint,
      passwordPolicy: d.password_policy ? normalizePasswordPolicyClient(d.password_policy) : undefined
    }
  },

  /** 二步验证：提交 TOTP 动态码 */
  async verifyMfaLogin(data: {
    mfaToken: string
    code: string
    revokeSessionId?: number
  }): Promise<LoginResult> {
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
          totp_enabled?: boolean
        }
        accessToken: string
        refreshToken: string
        password_policy_hint?: string
        password_policy?: PasswordPolicyClient
      }
    }>('/auth/mfa/verify', data)
    const d = res.data.data
    return {
      message: '登录成功',
      user: mapAuthUser(d.user),
      token: d.accessToken,
      refreshToken: d.refreshToken,
      passwordPolicyHint: d.password_policy_hint,
      passwordPolicy: d.password_policy ? normalizePasswordPolicyClient(d.password_policy) : undefined
    }
  },

  async mfaSetupStart(): Promise<{ otpauthUrl: string; accountLabel: string }> {
    const res = await request.post<{ success: boolean; data: { otpauthUrl: string; accountLabel: string } }>(
      '/auth/mfa/setup/start',
      {}
    )
    return res.data.data
  },

  async mfaSetupConfirm(code: string): Promise<void> {
    await request.post('/auth/mfa/setup/confirm', { code })
  },

  async mfaSetupCancel(): Promise<void> {
    await request.post('/auth/mfa/setup/cancel', {})
  },

  async mfaDisable(password: string, code: string): Promise<void> {
    await request.post('/auth/mfa/disable', { password, code })
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

  /** 当前系统密码策略（无需登录） */
  async getPasswordPolicy(): Promise<PasswordPolicyClient> {
    const res = await request.get<{ success: boolean; data: PasswordPolicyClient }>('/auth/password-policy')
    return normalizePasswordPolicyClient(res.data.data)
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
        totp_enabled?: boolean;
        mfa_setup_pending?: boolean;
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
      totpEnabled: Boolean(backendUser.totp_enabled),
      mfaSetupPending: Boolean(backendUser.mfa_setup_pending),
    }
  }
}

export default request
