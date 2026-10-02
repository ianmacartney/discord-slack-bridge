"use client";
import { useMemo, useState } from "react";
import type { Id } from "@discord-slack-bridge/db/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDateTime, getRelativeTime } from "@/lib/time";

export type Ticket = {
  _id: Id<"tickets">;
  _creationTime: number;
  updateTime: number;
  status: string;
  title: string;
  name?: string;
};

const VIEW_TITLES: Record<string, string> = {
  open: "Open tickets",
  mine: "Assigned to me",
  resolved: "Resolved tickets",
};
const ALL = "all"; // Select values can't be empty strings.

/** The tickets table with its filters. Pure UI: the page loads the tickets and passes them in. */
export function TicketList({
  view,
  results,
  isLoading,
  canLoadMore,
  loadMore,
  onResolve,
}: {
  view: string;
  results: Ticket[];
  isLoading: boolean;
  canLoadMore: boolean;
  loadMore: () => void;
  onResolve: (ticketId: Id<"tickets">) => void;
}) {
  // Filters apply to the tickets loaded so far. The sidebar view decides which tickets the server returns.
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [assignee, setAssignee] = useState(ALL);

  const assignees = useMemo(
    () => [...new Set(results.flatMap((t) => (t.name ? [t.name] : [])))].sort(),
    [results],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return results.filter(
      (t) =>
        (!query || t.title.toLowerCase().includes(query)) &&
        (statusFilter === ALL || t.status === statusFilter) &&
        (assignee === ALL || t.name === assignee),
    );
  }, [results, search, statusFilter, assignee]);
  const filtering = search !== "" || statusFilter !== ALL || assignee !== ALL;

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">
          {VIEW_TITLES[view] ?? "Tickets"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Support threads escalated from the Discord support forum.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search titles"
          aria-label="Search titles"
          className="w-full sm:max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger
            className="w-full sm:w-40"
            aria-label="Filter by status"
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="escalated">Escalated</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger
            className="w-full sm:w-44"
            aria-label="Filter by assignee"
          >
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Anyone</SelectItem>
            {assignees.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtering && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch("");
              setStatusFilter(ALL);
              setAssignee(ALL);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Status</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="hidden w-36 md:table-cell">
                Assignee
              </TableHead>
              <TableHead className="hidden w-32 lg:table-cell">
                Updated
              </TableHead>
              <TableHead className="hidden w-32 xl:table-cell">Age</TableHead>
              <TableHead className="w-px text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            )}
            {filtered.map((ticket) => (
              <TableRow key={ticket._id}>
                <TableCell>
                  <Badge
                    variant={
                      ticket.status === "resolved" ? "secondary" : "default"
                    }
                  >
                    {ticket.status}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-0 truncate" title={ticket.title}>
                  {ticket.title}
                </TableCell>
                <TableCell className="hidden truncate md:table-cell">
                  {ticket.name ?? "Unassigned"}
                </TableCell>
                <TableCell
                  className="hidden font-mono text-xs text-muted-foreground lg:table-cell"
                  title={getDateTime(ticket.updateTime)}
                >
                  {getRelativeTime(ticket.updateTime)}
                </TableCell>
                <TableCell
                  className="hidden font-mono text-xs text-muted-foreground xl:table-cell"
                  title={getDateTime(ticket._creationTime)}
                >
                  {getRelativeTime(ticket._creationTime)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {ticket.status !== "resolved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onResolve(ticket._id)}
                      >
                        Resolve
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  {filtering
                    ? "No tickets match these filters"
                    : "There are no tickets"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {filtering
            ? `${filtered.length} of ${results.length} loaded tickets`
            : `${results.length} tickets loaded`}
        </span>
        {canLoadMore && (
          <Button variant="outline" size="sm" onClick={loadMore}>
            Load more
          </Button>
        )}
      </div>
    </div>
  );
}
