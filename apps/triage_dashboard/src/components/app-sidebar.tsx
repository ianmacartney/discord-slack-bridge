"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheckIcon, InboxIcon, UserIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

// The page reads the same `view` search param (see TriagePage in app/page.tsx).
export const TICKET_VIEWS = [
  { view: "open", label: "Open tickets", icon: InboxIcon },
  { view: "mine", label: "Assigned to me", icon: UserIcon },
  { view: "resolved", label: "Resolved", icon: CircleCheckIcon },
] as const;

export function AppSidebar() {
  const current = useSearchParams().get("view") ?? "open";
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-3 text-sm font-medium">
        Discord Triage
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Tickets</SidebarGroupLabel>
          <SidebarMenu>
            {TICKET_VIEWS.map(({ view, label, icon: Icon }) => (
              <SidebarMenuItem key={view}>
                <SidebarMenuButton
                  asChild
                  isActive={current === view}
                  tooltip={label}
                >
                  <Link href={`/?view=${view}`}>
                    <Icon />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
