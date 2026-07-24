import request from '@utils/request'
import type { UserRole } from '@typing/user'

export interface UserProfileDTO {
  id: number
  username: string
  email: string | null
  role: UserRole
  storageQuota: number
  storageUsed: number
  status: string
  vipExpireAt: string | null
  avatarUrl: string | null
  createdAt: string
  totpEnabled?: boolean
  mfaSetupPending?: boolean
}

function mapProfile(data: {
  id: number
  username: string
  email: string | null
  role: UserRole
  storage_quota: number
  storage_used: number
  status: string
  vip_expire_at: string | null
  avatar_url: string | null
  created_at: string
  totp_enabled?: boolean
  mfa_setup_pending?: boolean
}): UserProfileDTO {
  return {
    id: data.id,
    username: data.username,
    email: data.email,
    role: data.role,
    storageQuota: data.storage_quota,
    storageUsed: data.storage_used,
    status: data.status,
    vipExpireAt: data.vip_expire_at,
    avatarUrl: data.avatar_url,
    createdAt: data.created_at,
    totpEnabled: Boolean(data.totp_enabled),
    mfaSetupPending: Boolean(data.mfa_setup_pending),
  }
}

/** 好友搜索等：与后端 GET /api/user/search 返回的 data 项一致 */
export interface UserSearchResultDTO {
  id: number
  username: string
  email: string | null
}

export const userApi = {
  /** 按用户名模糊或纯数字按 ID 搜索用户（不含当前登录用户），最多 20 条 */
  async search(keyword: string): Promise<UserSearchResultDTO[]> {
    const trimmed = keyword.trim()
    if (!trimmed) return []
    const res = await request.get<{ success: boolean; data: UserSearchResultDTO[] }>('/user/search', {
      params: { keyword: trimmed },
    })
    return res.data.data ?? []
  },

  async getProfile(): Promise<UserProfileDTO> {
    const res = await request.get<{
      success: boolean
      data: {
        id: number
        username: string
        email: string | null
        role: UserRole
        storage_quota: number
        storage_used: number
        status: string
        vip_expire_at: string | null
        avatar_url: string | null
        created_at: string
        totp_enabled?: boolean
        mfa_setup_pending?: boolean
      }
    }>('/user/profile')
    return mapProfile(res.data.data)
  },

  async updateProfile(body: { email: string }): Promise<UserProfileDTO> {
    const res = await request.put<{
      success: boolean
      data: {
        id: number
        username: string
        email: string | null
        role: UserRole
        storage_quota: number
        storage_used: number
        status: string
        vip_expire_at: string | null
        avatar_url: string | null
        created_at: string
      }
    }>('/user/profile', body)
    return mapProfile(res.data.data)
  },

  async uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
    const form = new FormData()
    form.append('avatar', file)
    const res = await request.post<{ success: boolean; data: { avatar_url: string } }>('/user/avatar', form)
    return { avatarUrl: res.data.data.avatar_url }
  },
}
