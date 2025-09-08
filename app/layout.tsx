import type { Metadata } from 'next'
import './globals.css'
// Note: App shell and providers moved to app/[locale]/layout.tsx for i18n

export const metadata: Metadata = {
  title: 'MurMur',
  description: 'Whisper.cpp GUI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {try{const t=localStorage.getItem('theme');const m=window.matchMedia('(prefers-color-scheme: dark)');const f=()=>{const d=(t==='dark')||((!t||t==='system')&&m.matches);const r=document.documentElement;r.classList[d?'add':'remove']('dark');};f();}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
