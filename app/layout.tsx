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
    <html lang="zh-CN">
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
