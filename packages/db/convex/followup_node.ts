"use node";

import { Infer, v } from "convex/values";
import { ChannelType, EmbedBuilder } from "discord.js";
import { internal } from "./_generated/api";
import { ActionCtx, internalAction } from "./_generated/server";
import { CARD_COLOR } from "./brandColors";
import { decide } from "./decisions";
import { discordClient } from "./discord_node";
import { forwardContext } from "./followup";
import { limitPerPerson } from "./limits";

// How sure Jev must be that the message deserves its own thread.
const MIN_WORTH_A_THREAD = 0.7;
// Discord limits a thread name to 100 characters and a message to 2000.
const MAX_TITLE = 90;
const MAX_MESSAGE = 2000;

/**
 * A needs_help message in the /forwardfrom channel: if Jev thinks it's a detailed problem worth a thread, the bot reacts
 * 👀, opens a support-forum post that quotes the message and replies with a link to the post. One post per person every
 * 30 minutes.
 */
export const forwardToSupport = internalAction({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, { messageId }): Promise<null> => {
    const context: Infer<typeof forwardContext> | null = await ctx.runQuery(
      internal.followup.getForwardContext,
      { messageId },
    );
    if (!context) return null;

    const { answers } = await decide(
      { message: context.text },
      {
        worth_a_thread: {
          type: "choice",
          instructions:
            "Should this chat message become its own support thread?",
          criteria: {
            yes: "A detailed question or problem written out at length, from someone who is stuck or worried about it.",
            no: "Short, casual, already answered, or not really a problem that needs follow-up.",
          },
        },
      },
    );
    const answer = answers.worth_a_thread;
    if (
      answer.type !== "choice" ||
      answer.choice !== "yes" ||
      (answer.confidence ?? 0) < MIN_WORTH_A_THREAD
    ) {
      return null;
    }
    const limit = await limitPerPerson(
      ctx,
      "helpFollowUp",
      context.authorDiscordId,
    );
    if (!limit.ok) return null;

    await openSupportPost(ctx, context, null);
    return null;
  },
});

/** A moderator used "Forward to support" on a message (the bot already checked it isn't forwarded yet). */
export const forwardManually = internalAction({
  args: { context: forwardContext, forwardedBy: v.string() },
  returns: v.null(),
  handler: async (ctx, { context, forwardedBy }): Promise<null> => {
    await openSupportPost(ctx, context, forwardedBy);
    return null;
  },
});

/**
 * Opens the support-forum post for a chat message: quotes it in the post, reacts 👀, replies with a link, records the
 * link for the 👍 on resolve, and posts a card in the mod channel. Used by the automatic flow and by moderators.
 */
async function openSupportPost(
  ctx: ActionCtx,
  context: Infer<typeof forwardContext>,
  forwardedBy: string | null,
) {
  const bot = await discordClient();
  try {
    const source = await bot.channels.fetch(context.sourceChannelId);
    const forum = await bot.channels.fetch(context.forumId);
    if (!source || !("messages" in source)) return null;
    if (!forum || forum.type !== ChannelType.GuildForum) return null;
    const original = await source.messages.fetch(context.discordMessageId);

    const firstLine = context.text.split("\n")[0].trim();
    const title =
      firstLine.length > MAX_TITLE
        ? `${firstLine.slice(0, MAX_TITLE)}…`
        : firstLine || "Help request";
    // Discord can't start a forum post with a forwarded message, so the post's first message quotes it instead.
    // The quoted text also gives auto-tagging something to read.
    const header = `<@${context.authorDiscordId}> asked in <#${context.sourceChannelId}> · [original message](${original.url})`;
    const room = MAX_MESSAGE - header.length - 6;
    const quoted =
      context.text.length > room
        ? `${context.text.slice(0, room)}…`
        : context.text;
    const thread = await forum.threads.create({
      name: title,
      message: {
        content: `${header}\n>>> ${quoted}`,
        allowedMentions: { users: [context.authorDiscordId] },
      },
    });
    await original.react("👀");
    // Point them at the new post without pinging them again.
    await original.reply({
      content: `Opened a thread in <#${thread.id}>`,
      allowedMentions: { repliedUser: false },
    });
    await ctx.runMutation(internal.followup.recordForward, {
      discordMessageId: context.discordMessageId,
      sourceChannelId: context.sourceChannelId,
      discordThreadId: thread.id,
      authorDiscordId: context.authorDiscordId,
    });

    // Let moderators know a message was turned into a post.
    const modChannelId: string | null = await ctx.runQuery(
      internal.guildSettings.modChannelFor,
      { guildId: context.guildId },
    );
    const mods = modChannelId ? await bot.channels.fetch(modChannelId) : null;
    if (mods && "send" in mods) {
      const excerpt = context.text.slice(0, 300);
      const embed = new EmbedBuilder()
        .setColor(CARD_COLOR.info)
        .setTitle("Message forwarded to support")
        .setURL(original.url)
        .setAuthor({
          name: original.author.displayName ?? original.author.username,
          iconURL: original.author.displayAvatarURL(),
        })
        .setDescription(
          `>>> ${excerpt}${context.text.length > excerpt.length ? "…" : ""}`,
        )
        .addFields(
          {
            name: "Posted by",
            value: `<@${context.authorDiscordId}>`,
            inline: true,
          },
          {
            name: "From",
            value: `<#${context.sourceChannelId}>`,
            inline: true,
          },
          { name: "Support post", value: `<#${thread.id}>`, inline: true },
          {
            name: "Forwarded by",
            value: forwardedBy ? `<@${forwardedBy}>` : "Automatically (Jev)",
            inline: true,
          },
        )
        .setTimestamp();
      await mods.send({ embeds: [embed], allowedMentions: { parse: [] } });
    }
  } catch (error) {
    console.error("forwarding to the support forum failed", error);
  } finally {
    await bot.destroy();
  }
}

/** The forwarded post was resolved: thumbs up on the original message in chat. */
export const reactResolved = internalAction({
  args: { sourceChannelId: v.string(), discordMessageId: v.string() },
  returns: v.null(),
  handler: async (_ctx, { sourceChannelId, discordMessageId }) => {
    const bot = await discordClient();
    try {
      const source = await bot.channels.fetch(sourceChannelId);
      if (!source || !("messages" in source)) return null;
      const original = await source.messages.fetch(discordMessageId);
      await original.react("👍");
    } catch (error) {
      console.error("reacting to a resolved forward failed", error);
    } finally {
      await bot.destroy();
    }
    return null;
  },
});
