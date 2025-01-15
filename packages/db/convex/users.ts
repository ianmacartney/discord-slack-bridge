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

export const memberId = internalQuery({
  args: {
    displayName: v.string(),
  },
  handler: async (ctx, { displayName }) => {
    const users = await ctx.db.query("users").withSearchIndex("displayName", (q) =>
      q.search("displayName", displayName),
    ).collect();
    const usersWithDisplayName = users.filter((u) => u.displayName === displayName);
    if (usersWithDisplayName.length === 0) {
      throw new Error("User not found");
    }
    const memberIds = [];
    for (const user of usersWithDisplayName) {
      if (!user.memberId) {
        throw new Error("User has no memberId");
      }
      const registrations = await ctx.db.query("registrations").withIndex("discordUserId", (q) =>
        q.eq("discordUserId", user.memberId!),
      ).collect();
      memberIds.push(...registrations.map((r) => r.associatedAccountId));
    }
    return memberIds;
  },
});

export const addEmployees = internalMutation({
  args: { users: v.array(v.object({ id: v.id("users"), email: v.string() })) },
  handler: async (ctx, { users }) => {
    for (const { id, email } of users) {
      await ctx.db.insert("employees", {
        userId: id,
        handlesTickets: true,
        email,
      });
    }
  },
});

export function isEmployeeEmail(email: string) {
  return email.endsWith("@convex.dev");
}
