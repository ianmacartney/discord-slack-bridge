import { v } from "convex/values";
import { env, internalQuery } from "./_generated/server";
import { apiMutation, apiQuery } from "./apiFunctions";
import { nullable } from "convex-helpers/validators";

export const getTagForum = apiQuery({
  args: { guildId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async ({ db }, { guildId }) => {
    const row = await db
      .query("guildSettings")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .unique();
    return row?.tagForumId ?? null;
  },
});

export const setTagForum = apiMutation({
  args: { guildId: v.string(), tagForumId: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async ({ db }, { guildId, tagForumId }) => {
    const row = await db
      .query("guildSettings")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .unique();
    if (row) {
      await db.patch("guildSettings", row._id, { tagForumId });
    } else {
      await db.insert("guildSettings", {
        guildId,
        tagForumId,
      });
    }
    return null;
  },
});

export const getModChannel = apiQuery({
  args: { guildId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async ({ db }, { guildId }) => {
    const row = await db
      .query("guildSettings")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .unique();
    return row?.modChannelId ?? null;
  },
});

export const setModChannel = apiMutation({
  args: { guildId: v.string(), modChannelId: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async ({ db }, { guildId, modChannelId }) => {
    const row = await db
      .query("guildSettings")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .unique();
    if (row) {
      await db.patch("guildSettings", row._id, { modChannelId });
    } else {
      await db.insert("guildSettings", {
        guildId,
        modChannelId,
      });
    }
    return null;
  },
});

export const modChannelFor = internalQuery({
  args: { guildId: v.union(v.string(), v.null()) },
  returns: v.union(v.string(), v.null()),
  handler: async ({ db }, { guildId }) => {
    const row = guildId
      ? await db
          .query("guildSettings")
          .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
          .unique()
      : null;
    return row?.modChannelId ?? env.MOD_CHANNEL_ID ?? null;
  },
});

const channelSettings = v.object({
  rulesChannelId: v.optional(nullable(v.string())),
  selfPromoChannelId: v.optional(nullable(v.string())),
  vipChannelIds: v.optional(v.array(v.string())),
});

export const getChannelSettings = apiQuery({
  args: { guildId: v.string() },
  returns: channelSettings,
  handler: async ({ db }, { guildId }) => {
    const row = await db
      .query("guildSettings")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .unique();
    return {
      rulesChannelId: row?.rulesChannelId ?? null,
      selfPromoChannelId: row?.selfPromoChannelId ?? null,
      vipChannelIds: row?.vipChannelIds ?? [],
    };
  },
});

export const setChannelSettings = apiMutation({
  args: { guildId: v.string(), patch: channelSettings },
  returns: v.null(),
  handler: async ({ db }, { guildId, patch }) => {
    const row = await db
      .query("guildSettings")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .unique();
    if (row) await db.patch("guildSettings", row._id, patch);
    else await db.insert("guildSettings", { guildId, ...patch });
    return null;
  },
});

export const reminderChannelsFor = internalQuery({
  args: { guildId: v.string() },
  returns: v.object({
    rulesChannelId: v.union(v.string(), v.null()),
    selfPromoChannelId: v.union(v.string(), v.null()),
    supportForumId: v.union(v.string(), v.null()),
  }),
  handler: async ({ db }, { guildId }) => {
    const row = await db
      .query("guildSettings")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .unique();
    return {
      rulesChannelId: row?.rulesChannelId ?? null,
      selfPromoChannelId: row?.selfPromoChannelId ?? null,
      supportForumId: row?.forwardToForumId ?? row?.tagForumId ?? null,
    };
  },
});

export const getForwardFrom = apiQuery({
  args: { guildId: v.string() },
  returns: v.object({
    fromChannelId: v.union(v.string(), v.null()),
    toForumId: v.union(v.string(), v.null()),
  }),
  handler: async ({ db }, { guildId }) => {
    const row = await db
      .query("guildSettings")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .unique();
    return {
      fromChannelId: row?.forwardFromChannelId ?? null,
      toForumId: row?.forwardToForumId ?? row?.tagForumId ?? null,
    };
  },
});

export const setForwardFrom = apiMutation({
  args: {
    guildId: v.string(),
    forwardFromChannelId: v.union(v.string(), v.null()),
    forwardToForumId: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (
    { db },
    { guildId, forwardFromChannelId, forwardToForumId },
  ) => {
    const row = await db
      .query("guildSettings")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .unique();
    if (row) {
      await db.patch("guildSettings", row._id, {
        forwardFromChannelId,
        forwardToForumId,
      });
    } else {
      await db.insert("guildSettings", {
        guildId,
        forwardFromChannelId,
        forwardToForumId,
      });
    }
    return null;
  },
});
