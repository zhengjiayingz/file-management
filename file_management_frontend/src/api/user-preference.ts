import request from '../utils/request'
import type { UserPreference, UpdatePreferenceParams, UpdatePreferenceResponse } from '../types/user-preference'

export const userPreferenceApi = {
  // 获取用户配置
  async getPreference(): Promise<UserPreference> {
    const res = await request.get<UserPreference>('/user-preferences')
    return res.data
  },

  // 更新用户配置
  async updatePreference(preference: UpdatePreferenceParams): Promise<UpdatePreferenceResponse> {
    const res = await request.put<UpdatePreferenceResponse>('/user-preferences', preference)
    return res.data
  }
}

export default userPreferenceApi
