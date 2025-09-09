"use client"

import {useEffect} from 'react'
import {useRouter} from 'next/navigation'

export default function IndexRedirect() {
  const router = useRouter()

  useEffect(() => {
    // 1) Prefer user-saved locale in localStorage
    try {
      const saved = localStorage.getItem('app_locale')
      if (saved === 'zh-CN' || saved === 'en') {
        router.replace(`/${saved}/home`)
        return
      }
    } catch {}

    // 2) Fallback: try to read Tauri settings if available
    ;(async () => {
      try {
        const {invoke} = await import('@tauri-apps/api/core')
        const loaded: any = await invoke('load_settings')
        const locale = loaded?.app_locale
        if (locale === 'zh-CN' || locale === 'en') {
          // Sync to localStorage for faster next boot
          try { localStorage.setItem('app_locale', locale) } catch {}
          router.replace(`/${locale}/home`)
          return
        }
      } catch {}

      // 3) Final fallback: default to zh-CN
      router.replace('/en/home')
    })()
  }, [router])

  // A minimal placeholder during client redirect
  return null
}
