// Follow-up for messages classified as needs_help: ask the person to elaborate in a thread in the support channel.
// The Discord reply itself is sent from followup_node.ts.
import { v } from "convex/values";
import { env, internalQuery } from "./_generated/server";

export const followUpContext = v.object({
  discordMessageId: v.string(),
  // The channel the message was posted in (never a thread), where the reply goes.
  replyChannelId: v.string(),
  authorDiscordId: v.string(),
  supportChannelId: v.union(v.string(), v.null()),
});

export const getFollowUpContext = internalQuery({
  args: { messageId: v.id("messages") },
  returns: v.union(v.null(), followUpContext),
  handler: async ({ db }, { messageId }) => {
    const message = await db.get("messages", messageId);
    // Already in a thread (including the support forum's posts): they're where we'd send them.
    if (!message || message.threadId) return null;
    const author = await db.get("users", message.authorId);
    const channel = await db.get("channels", message.channelId);
    if (!author || !channel || author.bot) return null;

    const supportChannelId = env.AUTO_REPLY_CHANNEL_ID ?? null;

    // Not in the channels the bot itself points people to or posts cards in: the ask-ai channel and the mod channel.
    const settings = await db.query("guildSettings").take(50);
    const excluded = new Set(
      [
        env.ASK_AI_CHANNEL_ID,
        env.MOD_CHANNEL_ID,
        ...settings.flatMap((s) => [s.askAiChannelId, s.modChannelId]),
      ].filter((id) => !!id),
    );
    if (excluded.has(channel.id)) return null;

    return {
      discordMessageId: message.id,
      replyChannelId: channel.id,
      authorDiscordId: author.id,
      supportChannelId,
    };
  },
});
