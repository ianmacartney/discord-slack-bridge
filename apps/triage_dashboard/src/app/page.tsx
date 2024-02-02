"use client";
import {
  Authenticated,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { SignInButton, UserButton } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/footer";
import { Paragraph } from "@/components/layout/paragraph";
import { ResponsiveSidebarButton } from "@/components/layout/responsive-sidebar-button";
import { StickyHeader } from "@/components/layout/sticky-header";
import { StickySidebar } from "@/components/layout/sticky-sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Home() {
  const sidebar = (
    <>
      <div>Sticky sidebar</div>
      Last
    </>
  );
  return (
    <>
      <StickyHeader className="p-2 flex items-center justify-between h-[3.25rem]">
        Discord Triage
        <SignInAndSignUpButtons />
        <ResponsiveSidebarButton className="sm:hidden">
          <div className="sm:hidden fixed bg-background w-screen top-[calc(3.25rem+1px)] h-[calc(100vh-(3.25rem+1px))]">
            <ScrollArea className="h-full">{sidebar}</ScrollArea>
          </div>
        </ResponsiveSidebarButton>
      </StickyHeader>
      <div className="container sm:grid grid-cols-[240px_minmax(0,1fr)]">
        <StickySidebar className="hidden sm:block top-[calc(3.25rem+1px)] h-[calc(100vh-(3.25rem+1px))]">
          {sidebar}
        </StickySidebar>
        <main className="min-h-[calc(100vh-(3.25rem+1px))]">Body</main>
      </div>
      <Footer>Footer below fold</Footer>
    </>
  );
}

function SignInAndSignUpButtons() {
  return (
    <div className="flex gap-4">
      <Authenticated>
        <UserButton afterSignOutUrl="#" />
      </Authenticated>
      <Unauthenticated>
        <SignInButton mode="modal">
          <Button variant="ghost">Sign in</Button>
        </SignInButton>
      </Unauthenticated>
    </div>
  );
}
