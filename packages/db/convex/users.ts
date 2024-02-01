import { v } from "convex/values";
import uniqBy from "lodash/uniqBy";
import { internalMutation, internalQuery } from "./_generated/server";

export const list = internalQuery({
  args: {
    name: v.optional(v.string()),
  },
  handler: async (ctx, { name }) => {
    if (name === undefined) {
      return await ctx.db.query("users").collect();
    }
    return uniqBy(
      (
        await Promise.all([
          await ctx.db
            .query("users")
            .withSearchIndex("username", (q) => q.search("username", name))
            .collect(),
          await ctx.db
            .query("users")
            .withSearchIndex("nickname", (q) => q.search("nickname", name))
            .collect(),
          await ctx.db
            .query("users")
            .withSearchIndex("displayName", (q) =>
              q.search("displayName", name),
            )
            .collect(),
        ])
      ).flat(),
      (user) => user._id,
    );
  },
});

export const addEmployees = internalMutation({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, { userIds }) => {
    for (const userId of userIds) {
      await ctx.db.insert("employees", { userId, handlesTickets: true });
    }
  },
});
