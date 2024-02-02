"use client";

import { ReactNode, useEffect } from "react";
import { ConvexReactClient, Authenticated, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ClerkProvider, useAuth, useUser } from "@clerk/clerk-react";
import { ErrorBoundary } from "./ErrorBoundary";
import { api } from "@discord-slack-bridge/db/convex/_generated/api";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ErrorBoundary>
      <ClerkProvider
        publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      >
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          {children}
          <Authenticated>
            <StoreUserInDatabase />
          </Authenticated>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </ErrorBoundary>
  );
}

function StoreUserInDatabase() {
  // const { user } = useUser();
  // const storeUser = useMutation(api.users.store);
  // useEffect(() => {
  //   void storeUser();
  // }, [storeUser, user?.id]);
  return null;
}
