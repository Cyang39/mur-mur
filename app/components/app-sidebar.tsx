'use client'

import { Home, Settings, Info, Brain } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {useLocale} from 'next-intl'
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
  
  const base = `/${locale}`;
  const items = [
    { title: "Home", href: base, icon: Home },
    { title: "AI Models", href: `${base}/models`, icon: Brain },
    { title: "Settings", href: `${base}/settings`, icon: Settings },
    { title: "About", href: `${base}/about`, icon: Info },
  ];

  return (
    <Sidebar className="w-64">
      <SidebarHeader className="px-6 py-4">
        <h3 className="text-lg font-semibold text-sidebar-foreground">MurMur</h3>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>应用程序</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    className="w-full justify-start"
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
