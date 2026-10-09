// Per-server settings written by the Discord bot (it passes CONVEX_API_TOKEN).
import { v } from "convex/values";
import { env, internalQuery } from "./_generated/server";
import { apiMutation, apiQuery } from "./apiFunctions";

const settings = v.object({
  vipChannelId: v.union(v.string(), v.null()),
  linkAllowedRoleIds: v.array(v.string()),
});

export const get = apiQuery({
  args: { guildId: v.string() },
  returns: settings,
  handler: async ({ db }, { guildId }) => {
    const row = await db
      .query("guildSettings")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .unique();
    return {
      vipChannelId: row?.vipChannelId ?? null,
      linkAllowedRoleIds: row?.linkAllowedRoleIds ?? [],
    };
  },
});

export const set = apiMutation({
  args: { guildId: v.string(), ...settings.fields },
  returns: v.null(),
  handler: async ({ db }, { guildId, vipChannelId, linkAllowedRoleIds }) => {
    const row = await db
      .query("guildSettings")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .unique();

    if (row) {
      await db.patch("guildSettings", row._id, {
        vipChannelId,
        linkAllowedRoleIds,
      });
    } else {
      await db.insert("guildSettings", {
        guildId,
        vipChannelId,
        linkAllowedRoleIds,
      });
    }
    return null;
  },
});

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
        vipChannelId: null,
        linkAllowedRoleIds: [],
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
        vipChannelId: null,
        linkAllowedRoleIds: [],
      });
    }
    return null;
  },
});

/** For server code: the mod channel for a server, from /modchannel, else the MOD_CHANNEL_ID env var, else null. */
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
        vipChannelId: null,
        linkAllowedRoleIds: [],
      });
    }
    return null;
  },
});
