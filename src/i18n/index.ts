import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './zh-CN.json'

// Resources are bundled, so init synchronously — no loading flash, no network.
void i18n.use(initReactI18next).init({
  resources: { 'zh-CN': { translation: zhCN } },
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  initAsync: false,
  interpolation: { escapeValue: false },
})

document.title = i18n.t('app.title')

export default i18n
