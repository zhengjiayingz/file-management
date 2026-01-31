import request from '../utils/request'
import type { UserPreference, UpdatePreferenceParams } from '../types/user-preference'

// 通用API响应接口
interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export const userPreferenceApi = {
  // 获取用户配置
  async getPreference(): Promise<Partial<UserPreference>> {
    const res = await request.get<ApiResponse<Partial<UserPreference>>>('/user-preferences')
    // 后端返回的数据包裹在 data 字段中: { success: true, data: { ... } }
    return res.data.data
  },

  // 更新用户配置
  async updatePreference(preference: UpdatePreferenceParams): Promise<Partial<UserPreference>> {
    const res = await request.put<ApiResponse<Partial<UserPreference>>>('/user-preferences', preference)
    return res.data.data
  }
}

export default userPreferenceApi
