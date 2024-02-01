import { v } from "convex/values";
import { query } from "./_generated/server";
import uniqBy from "lodash/uniqBy";

export const list = query({
  args: {
    name: v.optional(v.string()),
  },
  handler: async ({ db }, { name }) => {
    if (name === undefined) {
      return await db.query("users").collect();
    }
    return uniqBy(
      (
        await Promise.all([
          await db
            .query("users")
            .withSearchIndex("username", (q) => q.search("username", name))
            .collect(),
          await db
            .query("users")
            .withSearchIndex("nickname", (q) => q.search("nickname", name))
            .collect(),
          await db
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
