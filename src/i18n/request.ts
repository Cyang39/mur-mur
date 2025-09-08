import {getRequestConfig} from 'next-intl/server'

export default getRequestConfig(async ({locale}) => {
  const resolvedLocale = locale ?? 'zh-CN'
  try {
    const messages = (await import(`../../messages/${resolvedLocale}.json`)).default
    return {locale: resolvedLocale, messages}
  } catch {
    const fallbackLocale = 'zh-CN'
    const messages = (await import(`../../messages/${fallbackLocale}.json`)).default
    return {locale: fallbackLocale, messages}
  }
})
