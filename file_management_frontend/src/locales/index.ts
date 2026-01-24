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

const i18n = createI18n({
  legacy: false, // Vue 3 Composition API 模式
  locale: localStorage.getItem('locale') || getBrowserLanguage(),
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
