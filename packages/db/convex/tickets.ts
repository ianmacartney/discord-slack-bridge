import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  MutationCtx,
  internalAction,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { DiscordChannel } from "./schema";
import { paginationOptsValidator } from "convex/server";
import { asyncMap } from "convex-helpers";
import { resolveThread } from "./discord";
import { isEmployeeEmail } from "./users";

export function shouldCreateTicketForDiscordThread(thread: DiscordChannel) {
  return thread.name === "support";
}

export async function createTicket(ctx: MutationCtx, threadId: Id<"threads">) {
  const ticketId = await ctx.db.insert("tickets", {
    updateTime: Date.now(),
    source: { type: "discord", id: threadId },
    status: "escalated",
  });
  await ctx.scheduler.runAfter(0, internal.tickets.inferAssignee, { ticketId });
}

export const inferAssignee = internalAction({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    await ctx.runMutation(internal.tickets.assignRandomEmployee, { ticketId });
  },
});

export const assignRandomEmployee = internalMutation({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, { ticketId }) => {
    const possibleAssignees = await ctx.db
      .query("employees")
      .withIndex("handlesTickets", (q) => q.eq("handlesTickets", true))
      .collect();
    const assigneeEmployee =
      possibleAssignees[Math.floor(Math.random() * possibleAssignees.length)];
    await ctx.db.patch(ticketId, { assignee: assigneeEmployee._id });
  },
});

export const getTickets = query({
  args: {
    resolved: v.boolean(),
    paginationOpts: paginationOptsValidator,
    mine: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return emptyPage();
    }
    const email = identity.email;
    if (!email || !identity.emailVerified) {
      throw new Error("Email not present or verified");
    }
    if (!isEmployeeEmail(email)) {
      throw new Error("Invalid employee email");
    }
    const currentEmployee = await ctx.db
      .query("employees")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    const query = ctx.db.query("tickets");
    const filtered =
      args.mine && currentEmployee !== null
        ? query.withIndex("assignee", (q) =>
            q.eq("assignee", currentEmployee._id),
          )
        : query;

    const ret = await filtered.paginate(args.paginationOpts);
    const page = await asyncMap(ret.page, async (ticket) => {
      const assignee = ticket.assignee && (await ctx.db.get(ticket.assignee));
      const assigneeUser = assignee && (await ctx.db.get(assignee.userId));
      const discordThread = await ctx.db.get(ticket.source.id);
      return {
        ...ticket,
        name: assigneeUser?.displayName,
        title: discordThread!.name,
      };
    });

    return { ...ret, page };
  },
});
export function emptyPage() {
  return {
    page: [],
    isDone: false,
    continueCursor: "",
    // This is a little hack around usePaginatedQuery,
    // which will lead to permanent loading state,
    // until a different result is returned
    pageStatus: "SplitRequired" as const,
  };
}

export const assignTicket = mutation({
  args: { ticketId: v.id("tickets") },
  handler: async (_ctx, args) => {
    console.log(args);
  },
});

export const resolveTicket = mutation({
  args: { ticketId: v.id("tickets") },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    await resolveThread(ctx, { threadId: ticket?.source.id });
  },
});
