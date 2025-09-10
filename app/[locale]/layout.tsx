import {NextIntlClientProvider} from 'next-intl'
import {ReactNode} from 'react'
import {notFound} from 'next/navigation'
import {locales} from '../../i18n/routing'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { MainContent } from '@/components/main-content'
import { ProcessingProvider } from '@/contexts/ProcessingContext'

export function generateStaticParams() {
  return locales.map((locale) => ({locale}))
}

async function loadMessages(locale: string) {
  try {
    switch (locale) {
      case 'en':
        return (await import('../../messages/en.json')).default
      case 'zh-CN':
        return (await import('../../messages/zh-CN.json')).default
      default:
        return (await import('../../messages/en.json')).default
    }
  } catch {
    return {} as any
  }
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!locales.includes(locale as any)) {
    notFound()
  }
  const messages = await loadMessages(locale)

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone} now={new Date()}>
      <ProcessingProvider>
        <SidebarProvider className="h-screen">
          <AppSidebar />
          <MainContent>{children}</MainContent>
        </SidebarProvider>
      </ProcessingProvider>
    </NextIntlClientProvider>
  )
}
