"use node";

import { v } from "convex/values";
import { Infer } from "convex/values";
import { EmbedBuilder } from "discord.js";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { CARD_COLOR } from "./brandColors";
import { discordClient } from "./discord_node";
import { limitPerPerson } from "./limits";
import { slowDownContext } from "./slowdown";

/** Replies to a message that went over the per-person speed limit, asking them to slow down. */
export const sendSlowDown = internalAction({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, { messageId }): Promise<null> => {
    const context: Infer<typeof slowDownContext> | null = await ctx.runQuery(
      internal.slowdown.getSlowDownContext,
      { messageId },
    );
    if (!context) return null;
    // At most one notice per person every 2 minutes, however many messages went over.
    const notice = await limitPerPerson(
      ctx,
      "slowDownNotice",
      context.authorDiscordId,
    );
    if (!notice.ok) return null;

    const bot = await discordClient();
    try {
      const channel = await bot.channels.fetch(context.replyChannelId);
      if (!channel || !("messages" in channel)) return null;
      const original = await channel.messages.fetch(context.discordMessageId);
      const embed = new EmbedBuilder()
        .setColor(CARD_COLOR.warning)
        .setTitle("Slow down")
        .setDescription(
          "You're posting faster than we can keep up with. Give it a few seconds between messages.",
        )
        .setFooter({ text: "A friendly reminder, not a warning" });
      // No ping: a visible nudge is enough, and a ping would make the notice itself noisy.
      await original.reply({
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
    } catch (error) {
      // A courtesy notice must never break message handling; just leave a trace in the logs.
      console.error("slow-down notice failed", error);
    } finally {
      await bot.destroy();
    }
    return null;
  },
});
