import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN'
import zhTW from './zh-TW'
import enUS from './en-US'

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

export default i18n
