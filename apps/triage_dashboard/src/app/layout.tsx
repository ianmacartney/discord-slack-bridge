import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "./ConvexClientProvider";
import { Footer } from "@/components/layout/footer";
import { StickyHeader } from "@/components/layout/sticky-header";
import { SignInAndSignUpButtons } from "../components/SignInAndSignUpButtons";
import { Authenticated } from "convex/react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Notes App",
  description: "This is an app to take notes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ConvexClientProvider>
          <StickyHeader className="p-2 flex items-center justify-between h-[3.25rem]">
            Discord Triage
            <SignInAndSignUpButtons />
          </StickyHeader>
          <main className="min-h-[calc(100vh-(2.5rem+1px))]">{children}</main>
          <Footer>Footer below fold</Footer>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
