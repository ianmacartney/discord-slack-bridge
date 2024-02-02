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

export default function Triage() {
  return (
    <>
      <Table>
        <TableHeader>
          <TableHead>Age</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Actions</TableHead>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>
              {" "}
              <div
                className="font-mono text-sm text-neutral-n6"
                title={getDateTime(ticket._creationTime)}
              >
                {getRelativeTime(ticket._creationTime)}
              </div>
            </TableCell>
            <TableCell>Cell 2</TableCell>
            <TableCell>Cell 3</TableCell>
            <TableCell className="flex items-center gap-3">
              <Button variant={"outline"}>Assign</Button>
              <Button variant={"destructive"}>Resolve</Button>
              <Button>Go to Discord</Button>
            </TableCell>
          </TableRow>
        </TableBody>
        <TableFooter></TableFooter>
      </Table>
    </>
  );
}
