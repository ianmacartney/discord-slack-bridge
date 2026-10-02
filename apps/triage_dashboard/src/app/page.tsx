"use client";
import {
  Authenticated,
  Unauthenticated,
  useMutation,
  usePaginatedQuery,
} from "convex/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api } from "@discord-slack-bridge/db/convex/_generated/api";
import { TicketList } from "@/components/ticket-list";

export default function TriagePage() {
  return (
    <>
      <Authenticated>
        <Suspense>
          <Triage />
        </Suspense>
      </Authenticated>
      <Unauthenticated>
        <div className="p-6 md:p-8">Sign in above.</div>
      </Unauthenticated>
    </>
  );
}

function Triage() {
  // Chosen in the sidebar: ?view=open (default), ?view=mine or ?view=resolved.
  const view = useSearchParams().get("view") ?? "open";
  const { isLoading, loadMore, results, status } = usePaginatedQuery(
    api.tickets.getTickets,
    { resolved: view === "resolved", mine: view === "mine" },
    { initialNumItems: 10 },
  );
  const resolve = useMutation(api.tickets.resolveTicket);
  return (
    <TicketList
      view={view}
      results={results}
      isLoading={isLoading}
      canLoadMore={status === "CanLoadMore"}
      loadMore={() => loadMore(10)}
      onResolve={(ticketId) => resolve({ ticketId })}
    />
  );
}
