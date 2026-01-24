import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN'
import zhTW from './zh-TW'
import enUS from './en-US'

// 导入 Element Plus 语言包
import zhCnElementPlus from 'element-plus/es/locale/lang/zh-cn'
import zhTwElementPlus from 'element-plus/es/locale/lang/zh-tw'
import enElementPlus from 'element-plus/es/locale/lang/en'

// 获取浏览器语言
const getBrowserLanguage = () => {
  const language = navigator.language
  if (language === 'zh-TW' || language === 'zh-HK') {
    return 'zh-TW'
  }
  if (language.startsWith('en')) {
    return 'en-US'
  }
  return 'zh-CN'
}

// 获取初始语言：未登录时使用浏览器语言，已登录时使用保存的语言
const getInitialLocale = () => {
  // 检查是否已登录（通过 token 判断）
  const token = localStorage.getItem('token')
  
  if (token) {
    // 已登录，使用保存的语言设置
    return localStorage.getItem('locale') || getBrowserLanguage()
  } else {
    // 未登录，始终使用浏览器语言
    return getBrowserLanguage()
  }
}

const i18n = createI18n({
  legacy: false, // Vue 3 Composition API 模式
  locale: getInitialLocale(),
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    'en-US': enUS
  }
})

// Element Plus 语言包映射 - 确保返回正确的对象
export const elementPlusLocaleMap: Record<string, any> = {
  'zh-CN': zhCnElementPlus,
  'zh-TW': zhTwElementPlus,
  'en-US': enElementPlus
}

export default i18n
