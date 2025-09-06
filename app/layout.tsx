import type { Metadata } from 'next'
import './globals.css'
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { MainContent } from './components/main-content';
import { ProcessingProvider } from './contexts/ProcessingContext';

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
      <body>
        <ProcessingProvider>
          <SidebarProvider className="h-screen">
            <AppSidebar />
            <MainContent>{children}</MainContent>
          </SidebarProvider>
        </ProcessingProvider>
      </body>
    </html>
  )
}
