import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  MutationCtx,
  internalAction,
  internalMutation,
  query,
} from "./_generated/server";
import { DiscordChannel } from "./schema";
import { paginationOptsValidator } from "convex/server";

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
    const assignee = (await ctx.db.get(assigneeEmployee.userId))!;
    await ctx.db.patch(ticketId, { assignee: assignee._id });
  },
});

export const getTickets = query({
  args: { resolved: v.boolean(),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, args) => {
    const tickets = await ctx.db.query("tickets").paginate(args.paginationOpts);
    return tickets;
  },
});
