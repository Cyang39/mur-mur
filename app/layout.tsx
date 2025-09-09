import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

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
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{
            var t=localStorage.getItem('theme');
            var m=window.matchMedia('(prefers-color-scheme: dark)');
            var d=(t==='dark')||((!t||t==='system')&&m.matches);
            var r=document.documentElement;
            if(d){r.classList.add('dark')}else{r.classList.remove('dark')}
          }catch(e){}`}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  )
}
