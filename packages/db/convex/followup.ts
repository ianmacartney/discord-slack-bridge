// Forwarding long help requests from chat into the support forum. Only messages in the channel picked with
// /forwardfrom count. The Discord side (forwarding, reactions) lives in followup_node.ts.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalMutation, internalQuery } from "./_generated/server";
import { apiMutation } from "./apiFunctions";

export const forwardContext = v.object({
  discordMessageId: v.string(),
  sourceChannelId: v.string(),
  guildId: v.string(),
  forumId: v.string(),
  authorDiscordId: v.string(),
  text: v.string(),
});

/** Null unless this is a person's message in the server's /forwardfrom channel that hasn't been forwarded yet. */
export const getForwardContext = internalQuery({
  args: { messageId: v.id("messages") },
  returns: v.union(v.null(), forwardContext),
  handler: async ({ db }, { messageId }) => {
    const message = await db.get("messages", messageId);
    if (!message || message.threadId) return null;
    const [author, channel] = await Promise.all([
      db.get("users", message.authorId),
      db.get("channels", message.channelId),
    ]);
    if (!author || !channel || author.bot) return null;

    // Messages don't record their server, so find the server whose /forwardfrom channel this is.
    const settings = (await db.query("guildSettings").take(50)).find(
      (s) => s.forwardFromChannelId === channel.id,
    );
    const forumId =
      settings?.forwardToForumId ??
      settings?.tagForumId ??
      env.AUTO_REPLY_CHANNEL_ID;
    if (!settings || !forumId) return null;

    const already = await db
      .query("helpForwards")
      .withIndex("by_discordMessageId", (q) =>
        q.eq("discordMessageId", message.id),
      )
      .first();
    if (already) return null;

    return {
      discordMessageId: message.id,
      sourceChannelId: channel.id,
      guildId: settings.guildId,
      forumId,
      authorDiscordId: author.id,
      text: message.cleanContent,
    };
  },
});

export const recordForward = internalMutation({
  args: {
    discordMessageId: v.string(),
    sourceChannelId: v.string(),
    discordThreadId: v.string(),
    authorDiscordId: v.string(),
  },
  returns: v.null(),
  handler: async ({ db }, args) => {
    await db.insert("helpForwards", args);
    return null;
  },
});

/**
 * Bot: a moderator used "Forward to support" on a message. Works in any channel, with no AI check and no rate limit.
 * Opens the post in the /forwardfrom forum (or the /tags forum).
 */
export const requestForward = apiMutation({
  args: {
    guildId: v.string(),
    sourceChannelId: v.string(),
    discordMessageId: v.string(),
    authorDiscordId: v.string(),
    text: v.string(),
    forwardedBy: v.string(),
  },
  returns: v.object({ ok: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, { forwardedBy, ...message }) => {
    const already = await ctx.db
      .query("helpForwards")
      .withIndex("by_discordMessageId", (q) =>
        q.eq("discordMessageId", message.discordMessageId),
      )
      .first();
    if (already) {
      return {
        ok: false,
        reason: `Already forwarded to <#${already.discordThreadId}>.`,
      };
    }
    const settings = await ctx.db
      .query("guildSettings")
      .withIndex("by_guildId", (q) => q.eq("guildId", message.guildId))
      .unique();
    const forumId =
      settings?.forwardToForumId ??
      settings?.tagForumId ??
      env.AUTO_REPLY_CHANNEL_ID;
    if (!forumId) {
      return {
        ok: false,
        reason: "No support forum is set. Use /forwardfrom set.",
      };
    }
    await ctx.scheduler.runAfter(0, internal.followup_node.forwardManually, {
      context: { ...message, forumId },
      forwardedBy,
    });
    return { ok: true };
  },
});
