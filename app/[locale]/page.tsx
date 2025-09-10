import {redirect} from 'next/navigation'
import {locales} from '../../i18n/routing'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  // Redirect /[locale] -> /[locale]/home
  redirect(`/${locale}/home`)
}
