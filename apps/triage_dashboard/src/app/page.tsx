"use client";
import {
  Authenticated,
  Unauthenticated,
  useMutation,
  usePaginatedQuery,
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
import { api } from "@discord-slack-bridge/db/convex/_generated/api";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDateTime, getRelativeTime } from "@/lib/time";
import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function TriagePage() {
  return (
    <>
      <Authenticated>
        <Triage />
      </Authenticated>
      <Unauthenticated>
        <div className="container p-10">Sign in above.</div>
      </Unauthenticated>
    </>
  );
}

function Triage() {
  const [resolved, setResolved] = useState(false);
  const { isLoading, loadMore, results, status } = usePaginatedQuery(
    api.tickets.getTickets,
    { resolved, mine: false },
    { initialNumItems: 10 },
  );
  const resolve = useMutation(api.tickets.resolveTicket);
  const ticket = useMemo(
    () => ({
      _id: "id",
      _creationTime: Date.now() - 10000,
      updateTime: Date.now(),
      source: { type: "discord", id: "123" },
      status: "escalated",
    }),
    [],
  );
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Age</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={5}>
                <Skeleton>Loading...</Skeleton>
              </TableCell>
            </TableRow>
          )}
          {results &&
            results.map((ticket) => (
              <TableRow key={ticket._id}>
                <TableCell>
                  {" "}
                  <div
                    className="font-mono text-sm text-neutral-n6"
                    title={getDateTime(ticket._creationTime)}
                  >
                    {getRelativeTime(ticket._creationTime)}
                  </div>
                </TableCell>
                <TableCell>
                  <div
                    className="font-mono text-sm text-neutral-n6"
                    title={getDateTime(ticket.updateTime)}
                  >
                    {getRelativeTime(ticket.updateTime)}
                  </div>
                </TableCell>
                <TableCell>{ticket.status}</TableCell>
                <TableCell>{ticket.title}</TableCell>
                <TableCell className="flex items-center gap-3">
                  <Button variant={"outline"}>Assign</Button>
                  <Button
                    variant={"destructive"}
                    onClick={() => {
                      resolve({ ticketId: ticket._id });
                    }}
                  >
                    Resolve
                  </Button>
                  <Button>Go to Discord</Button>
                </TableCell>
              </TableRow>
            ))}
          {results && results.length === 0 ? "There are no tickets" : null}
        </TableBody>
        <TableFooter></TableFooter>
      </Table>
    </>
  );
}
