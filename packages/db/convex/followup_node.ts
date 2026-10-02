"use node";

import { v } from "convex/values";
import { Infer } from "convex/values";
import { EmbedBuilder } from "discord.js";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { CARD_COLOR } from "./brandColors";
import { discordClient } from "./discord_node";
import { followUpContext } from "./followup";
import { limitPerPerson } from "./limits";

/** Replies to a needs_help message, asking the person to elaborate in a thread in the support channel. */
export const sendHelpFollowUp = internalAction({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, { messageId }): Promise<null> => {
    const context: Infer<typeof followUpContext> | null = await ctx.runQuery(
      internal.followup.getFollowUpContext,
      { messageId },
    );
    if (!context) return null;
    // Consumes this person's one reply per 30 minutes. Atomic, so two quick messages can't both get a reply.
    const limit = await limitPerPerson(
      ctx,
      "helpFollowUp",
      context.authorDiscordId,
    );
    if (!limit.ok) return null;

    const where = context.supportChannelId
      ? `<#${context.supportChannelId}>`
      : "the community support channel";

    const bot = await discordClient();
    try {
      const channel = await bot.channels.fetch(context.replyChannelId);
      if (!channel || !("messages" in channel)) return null;
      const original = await channel.messages.fetch(context.discordMessageId);
      // The ask-ai channel is per server (set with /askai), so find the server this message came from.
      const askAiChannelId: string | null = await ctx.runQuery(
        internal.guildSettings.askAiChannelFor,
        { guildId: "guild" in channel ? channel.guild.id : null },
      );
      const askAi = askAiChannelId
        ? ` For a quick answer first, you can also try <#${askAiChannelId}>.`
        : "";
      const embed = new EmbedBuilder()
        .setColor(CARD_COLOR.info)
        .setTitle("Thanks for reaching out")
        .setDescription(
          `Hello there, we appreciate you reaching out. Can you please elaborate further in a thread in ${where}?${askAi}`,
        )
        .setFooter({ text: "A thread keeps the conversation easy to find" });
      // Don't ping the person a second time; the reply thread line already points at their message.
      await original.reply({
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
    } catch (error) {
      // A failed courtesy reply must never break classification; just leave a trace in the logs.
      console.error("help follow-up failed", error);
    } finally {
      await bot.destroy();
    }
    return null;
  },
});
