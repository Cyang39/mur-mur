import {redirect} from 'next/navigation'
import {locales} from '../../i18n/routing'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default function Page({ params }: { params: { locale: string } }) {
  const locale = params.locale
  // Redirect /[locale] -> /[locale]/home
  redirect(`/${locale}/home`)
}
