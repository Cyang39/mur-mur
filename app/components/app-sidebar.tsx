'use client'

import { Home, Settings, Info, Brain } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {useLocale, useTranslations} from 'next-intl'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type AppSidebarProps = {};

export function AppSidebar({}: AppSidebarProps) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations('Sidebar')
  const normalize = (p: string) => {
    if (p.length > 1 && p.endsWith('/')) return p.slice(0, -1)
    return p
  }
  
  const base = `/${locale}`;
  const items = [
    { title: t('home'), href: `${base}/home`, icon: Home },
    { title: t('models'), href: `${base}/models`, icon: Brain },
    { title: t('settings'), href: `${base}/settings`, icon: Settings },
    { title: t('about'), href: `${base}/about`, icon: Info },
  ];

  return (
    <Sidebar className="w-64">
      <SidebarHeader className="px-6 py-4">
        <h3 className="text-lg font-semibold text-sidebar-foreground">MurMur</h3>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('app')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const normalizedPath = normalize(pathname)
                const active = item.icon === Home
                  ? (normalizedPath === normalize(item.href) || normalizedPath === normalize(base))
                  : normalizedPath === normalize(item.href)
                return (
                  <SidebarMenuItem key={item.href}>
                    {active ? (
                      <SidebarMenuButton
                        isActive
                        aria-current="page"
                        aria-disabled="true"
                        className="w-full justify-start cursor-default"
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton
                        asChild
                        isActive={false}
                        className="w-full justify-start"
                      >
                        <Link href={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
