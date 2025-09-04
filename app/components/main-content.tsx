'use client'

import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';

export function MainContent({ children }: { children: React.ReactNode }) {
  const { open, isMobile } = useSidebar();
  
  return (
    <div className={`flex flex-col flex-1 transition-all duration-300 ${
      open && !isMobile ? 'pl-64' : 'pl-0'
    }`}>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
      </header>
      <main className="flex-1 p-6 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}