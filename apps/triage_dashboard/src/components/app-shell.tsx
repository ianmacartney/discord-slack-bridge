"use client";

import { Authenticated } from "convex/react";
import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { Footer } from "@/components/layout/footer";
import { StickyHeader } from "@/components/layout/sticky-header";
import { SignInAndSignUpButtons } from "@/components/SignInAndSignUpButtons";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

// Client component: the sidebar primitives use React context, so the server layout only renders this wrapper.
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <Authenticated>
          <Suspense>
            <AppSidebar />
          </Suspense>
        </Authenticated>
        <SidebarInset>
          <StickyHeader className="p-2 flex items-center justify-between h-13">
            <div className="flex items-center gap-2">
              <Authenticated>
                <SidebarTrigger />
              </Authenticated>
              Discord Triage
            </div>
            <SignInAndSignUpButtons />
          </StickyHeader>
          <main className="min-h-[calc(100vh-(2.5rem+1px))]">{children}</main>
          <Footer>Footer below fold</Footer>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
