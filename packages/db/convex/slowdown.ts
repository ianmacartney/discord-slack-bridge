// Slow-down notice: when someone posts faster than the per-person limit (limits.ts), the bot replies once in a while.
// The Discord reply itself is sent from slowdown_node.ts.
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const slowDownContext = v.object({
  discordMessageId: v.string(),
  // The channel or thread the message was posted in, where the reply goes.
  replyChannelId: v.string(),
  authorDiscordId: v.string(),
});

/** Returns null for a missing message or a bot author, so the bot never tells itself or other bots to slow down. */
export const getSlowDownContext = internalQuery({
  args: { messageId: v.id("messages") },
  returns: v.union(v.null(), slowDownContext),
  handler: async ({ db }, { messageId }) => {
    const message = await db.get("messages", messageId);
    if (!message) return null;
    const [author, channel, thread] = await Promise.all([
      db.get("users", message.authorId),
      db.get("channels", message.channelId),
      message.threadId ? db.get("threads", message.threadId) : null,
    ]);
    if (!author || !channel || author.bot) return null;
    return {
      discordMessageId: message.id,
      replyChannelId: thread?.id ?? channel.id,
      authorDiscordId: author.id,
    };
  },
});
