export type UserLocale = 'auto' | 'zh-CN' | 'zh-TW' | 'en-US';
export type UserTheme = 'auto' | 'light' | 'dark';

export interface UserPreference {
  id: number;
  userId: number;
  locale: UserLocale;
  theme: UserTheme;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePreferenceParams {
  locale?: UserLocale;
  theme?: UserTheme;
}

export interface UpdatePreferenceResponse {
  message: string;
  preferences: UserPreference;
}
