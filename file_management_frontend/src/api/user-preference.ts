import request from '../utils/request'

export interface UserPreference {
  locale: string  // 'zh-CN' | 'zh-TW' | 'en-US' | 'auto'
  theme: string   // 'light' | 'dark' | 'auto'
}

export const userPreferenceApi = {
  // 获取用户配置
  async getPreference(): Promise<UserPreference> {
    const response = await request.get('/user-preferences')
    return response.data.data
  },

  // 更新用户配置
  async updatePreference(preference: Partial<UserPreference>): Promise<UserPreference> {
    const response = await request.put('/user-preferences', preference)
    return response.data.data
  }
}

export default userPreferenceApi
