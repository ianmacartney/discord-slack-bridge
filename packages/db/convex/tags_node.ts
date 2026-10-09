"use node";

import { v } from "convex/values";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { CARD_COLOR } from "./brandColors";
import { discordClient } from "./discord_node";

// Discord allows at most 5 tags on a forum post.
const MAX_APPLIED_TAGS = 5;

/**
 * Adds and removes forum tags on a post. Tags a human added are never touched, because only the ids passed in are
 * removed. Needs Manage Threads on the forum.
 */
export const applyThreadTags = internalAction({
  args: {
    discordThreadId: v.string(),
    addTagIds: v.array(v.string()),
    removeTagIds: v.array(v.string()),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (
    _ctx,
    { discordThreadId, addTagIds, removeTagIds, reason },
  ) => {
    const bot = await discordClient();
    try {
      const thread = await bot.channels.fetch(discordThreadId);
      if (!thread || !thread.isThread()) return null;
      const kept = thread.appliedTags.filter(
        (id) => !removeTagIds.includes(id),
      );
      const merged = [...new Set([...kept, ...addTagIds])].slice(
        0,
        MAX_APPLIED_TAGS,
      );
      await thread.setAppliedTags(merged, reason);
    } catch (error) {
      // Tagging is a convenience: log it, never fail the pipeline.
      console.error("applying forum tags failed", error);
    } finally {
      await bot.destroy();
    }
    return null;
  },
});

/** Posts "Tagged <post>: Bug Report (0.91), Billing (0.84)" with an Undo button in the mod channel. */
export const postTagNote = internalAction({
  args: { decisionId: v.id("tagDecisions") },
  returns: v.null(),
  handler: async (ctx, { decisionId }): Promise<null> => {
    const decision: Doc<"tagDecisions"> | null = await ctx.runQuery(
      internal.tags.getDecision,
      { decisionId },
    );
    if (!decision || decision.status !== "applied") return null;
    const modChannelId: string | null = await ctx.runQuery(
      internal.guildSettings.modChannelFor,
      { guildId: decision.guildId ?? null },
    );
    if (!modChannelId) return null;

    // The post's title and its opening message, so moderators see what was tagged without leaving the card.
    const thread: {
      title: string;
      messages: string[];
      ownerId: string | null;
      ownerName: string | null;
      ownerAvatarUrl: string | null;
    } | null = await ctx.runQuery(internal.tags.getThreadForTagging, {
      threadId: decision.threadId,
    });
    const excerpt = thread?.messages[0]?.slice(0, 300);
    const tags = decision.decisions
      .flatMap((d) =>
        d.tag ? [`${d.tag} (${Math.round(d.confidence * 100)}%)`] : [],
      )
      .join(", ");
    const link = decision.guildId
      ? `https://discord.com/channels/${decision.guildId}/${decision.discordThreadId}`
      : null;

    const embed = new EmbedBuilder()
      .setColor(CARD_COLOR.added)
      .setTitle((thread?.title ?? "Forum post").slice(0, 250))
      .setDescription(excerpt ? `>>> ${excerpt}` : null)
      .addFields(
        {
          name: "Posted by",
          value: thread?.ownerId ? `<@${thread.ownerId}>` : "Unknown",
          inline: true,
        },
        {
          name: "Thread",
          value: `<#${decision.discordThreadId}>`,
          inline: true,
        },
        { name: "Type of thread", value: tags || "None" },
      )
      .setTimestamp()
      .setFooter({
        text:
          decision.trigger === "retag"
            ? "Re-run by a moderator"
            : "Tagged automatically",
      });
    // The title itself is a link to the post, and the poster's avatar and name sit at the top of the card.
    if (link) embed.setURL(link);
    if (thread?.ownerName) {
      embed.setAuthor({
        name: thread.ownerName,
        iconURL: thread.ownerAvatarUrl ?? undefined,
      });
    }
    const bot = await discordClient();
    try {
      const channel = await bot.channels.fetch(modChannelId);
      if (!channel || !("send" in channel)) return null;
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`tag:undo:${decision._id}`)
          .setLabel("Undo")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`tag:edit:${decision._id}`)
          .setLabel("Edit")
          .setStyle(ButtonStyle.Primary),
      );
      const sent = await channel.send({
        embeds: [embed],
        components: [row],
        allowedMentions: { parse: [] },
      });
      await ctx.runMutation(internal.tags.setNoteMessage, {
        decisionId,
        noteMessageId: sent.id,
      });
    } catch (error) {
      // The note is optional: tagging already happened.
      console.error("posting the tag note failed", error);
    } finally {
      await bot.destroy();
    }
    return null;
  },
});
