import 'i18next'
import type zhCN from './zh-CN.json'

// Type-checked keys: t('missing.key') is a compile error.
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof zhCN }
  }
}
