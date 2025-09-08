import {defineRouting} from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['zh-CN', 'en'],
  defaultLocale: 'zh-CN',
  localePrefix: 'always'
})

export const locales = routing.locales
export type Locale = typeof locales[number]
export const defaultLocale: Locale = routing.defaultLocale
