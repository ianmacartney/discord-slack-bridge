"use node";

import { v } from "convex/values";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Guild,
  GuildMember,
  PermissionFlagsBits as P,
} from "discord.js";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { ActionCtx, env, internalAction } from "./_generated/server";
import { CARD_COLOR } from "./brandColors";
import { VIOLATION_TITLES } from "./violations";
import { discordClient } from "./discord_node";

// Bot permissions
export const ACTION_PERMISSION = {
  delete: P.ManageMessages,
  timeout: P.ModerateMembers,
  kick: P.KickMembers,
  ban: P.BanMembers,
  // A warning is a DM, which needs no server permission; viewing the channel is just a harmless check.
  warn: P.ViewChannel,
  untimeout: P.ModerateMembers,
} as const;

const MODERATOR_PERMISSIONS = [
  P.Administrator,
  P.ManageGuild,
  P.KickMembers,
  P.BanMembers,
  P.ModerateMembers,
];

/**
 * Returns why this target must not be moderated, or null if it is fine to proceed.
 * These checks run at execution time against live Discord data, on top of Discord's own rules
 * (nobody can ban, kick or time out the server owner).
 */
function safetyBlock(
  guild: Guild,
  targetId: string,
  member: GuildMember | null,
  me: GuildMember,
) {
  const exempt = (env.MODERATION_EXEMPT_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim());
  if (exempt.includes(targetId)) return "target is on the exempt list";
  if (targetId === me.id) return "target is the moderation bot itself";
  if (targetId === guild.ownerId) return "target is the server owner";
  if (!member) return null; // Already left; only a message delete can still apply.
  if (member.user.bot && env.MODERATION_ALLOW_BOT_TARGETS !== "true")
    return "target is a bot";
  if (member.permissions.any(MODERATOR_PERMISSIONS))
    return "target is an admin or moderator";
  if (member.roles.highest.comparePositionTo(me.roles.highest) >= 0)
    return "target's top role is not below the bot's";
  return null;
}

/**
 * Posts the rule-violation card ("Spam detected", ...) in the mod channel once the automatic timeout has run, or in
 * dry-run mode would have. It shows the deleted message and has the action buttons; presses are handled by the bot
 * process (the `alert:` buttons in discordBot.ts). If a safety check skipped the timeout (staff, the owner), no card is
 * posted, because nobody needs to act.
 */
async function postAlertCard(
  ctx: ActionCtx,
  bot: Client,
  guild: Guild,
  action: Doc<"moderationActions">,
  outcome: "executed" | "dry_run",
) {
  if (!action.auto || action.action !== "timeout" || !action.alertId) return;
  try {
    const alert: Doc<"modAlerts"> | null = await ctx.runQuery(
      internal.moderation.getAlert,
      { alertId: action.alertId },
    );
    if (!alert) return;
    const modChannelId: string | null = await ctx.runQuery(
      internal.guildSettings.modChannelFor,
      { guildId: guild.id },
    );
    if (!modChannelId) return;
    const channel = await bot.channels.fetch(modChannelId);
    if (!channel || !("send" in channel)) return;

    const live = outcome === "executed";
    const quote = alert.content.slice(0, 900) || "(no text)";
    // NSFW text is hidden behind a spoiler, so moderators choose whether to read it.
    const shown = alert.kind === "nsfw_or_violent" ? `||${quote}||` : quote;
    const embed = new EmbedBuilder()
      .setColor(live ? CARD_COLOR.danger : CARD_COLOR.removed)
      .setTitle(VIOLATION_TITLES[alert.kind] ?? "Rule violation detected")
      .setDescription(`>>> ${shown}`)
      .addFields(
        {
          name: "User",
          value: `<@${alert.targetDiscordUserId}>`,
          inline: true,
        },
        { name: "Channel", value: `<#${alert.channelId}>`, inline: true },
        ...(alert.confidence !== undefined
          ? [
              {
                name: "Confidence",
                value: `${Math.round(alert.confidence * 100)}%`,
                inline: true,
              },
            ]
          : []),
        {
          name: "Actions taken",
          value: live
            ? "Message deleted, timed out for 1 day"
            : "Would delete the message and time them out for 1 day (dry run: nothing was done)",
        },
        {
          name: "Actions needed",
          value:
            alert.kind === "mass_mention"
              ? "Ban (rule 5 says immediate ban), Kick, Timeout, or Warn"
              : "Ban, Kick, Timeout, or Warn",
        },
      )
      .setTimestamp()
      .setFooter({
        text: "Press a button. Dismiss lifts the timeout if this was a mistake.",
      });
    const button = (choice: string, label: string, style: ButtonStyle) =>
      new ButtonBuilder()
        .setCustomId(`alert:${choice}:${alert._id}`)
        .setLabel(label)
        .setStyle(style);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      button("ban", "Ban", ButtonStyle.Danger),
      button("kick", "Kick", ButtonStyle.Secondary),
      button("timeout", "Timeout 7 days", ButtonStyle.Secondary),
      button("warn", "Warn", ButtonStyle.Primary),
      button("dismiss", "Dismiss and undo", ButtonStyle.Secondary),
    );
    const sent = await channel.send({
      embeds: [embed],
      components: [row],
      allowedMentions: { parse: [] },
    });
    await ctx.runMutation(internal.moderation.setAlertNote, {
      alertId: alert._id,
      noteMessageId: sent.id,
    });
  } catch (error) {
    console.error("couldn't post a rule-violation card", error);
  }
}

// How each outcome of an automatic action looks in the mod channel.
const OUTCOME_CARD = {
  executed: {
    color: CARD_COLOR.danger,
    titleSuffix: "",
    footer: () => "Done",
  },
  dry_run: {
    color: CARD_COLOR.removed,
    titleSuffix: " (dry run)",
    footer: () => "Nothing was done: dry-run mode is on",
  },
  skipped: {
    color: CARD_COLOR.muted,
    titleSuffix: " skipped",
    footer: (note?: string) =>
      `Not done: ${note ?? "a safety check blocked it"}`,
  },
} as const;

/**
 * Tells the mod channel about an action the bot took (or, in dry-run mode, would have taken) on its own. Actions a
 * moderator approved already have a proposal card, so only automatic ones are logged. Never fails the action.
 */
async function logAutoAction(
  ctx: ActionCtx,
  bot: Client,
  guild: Guild,
  action: Doc<"moderationActions">,
  outcome: "executed" | "dry_run" | "skipped",
  note?: string,
) {
  const fromChatCommand = action.category === "chat_command";
  if (!action.auto && !fromChatCommand) return;
  // A card (postAlertCard) reports on these, so only a skip needs its own log line.
  if (action.alertId && outcome !== "skipped") return;
  try {
    const modChannelId: string | null = await ctx.runQuery(
      internal.guildSettings.modChannelFor,
      { guildId: guild.id },
    );
    if (!modChannelId) return;
    const channel = await bot.channels.fetch(modChannelId);
    if (!channel || !("send" in channel)) return;
    const embed = new EmbedBuilder()
      .setColor(OUTCOME_CARD[outcome].color)
      .setTitle(
        `${fromChatCommand ? "Moderator" : "Automatic"} ${action.action}${OUTCOME_CARD[outcome].titleSuffix}`,
      )
      .addFields(
        {
          name: "Target",
          value: `<@${action.targetDiscordUserId}>`,
          inline: true,
        },
        ...(action.durationMinutes
          ? [
              {
                name: "Duration",
                value: `${action.durationMinutes} minutes`,
                inline: true,
              },
            ]
          : []),
        ...(action.deleteMessageDays
          ? [
              {
                name: "Messages deleted",
                value: `Last ${action.deleteMessageDays} day(s)`,
                inline: true,
              },
            ]
          : []),
        ...(fromChatCommand && action.decidedBy
          ? [{ name: "By", value: `<@${action.decidedBy}>`, inline: true }]
          : []),
        { name: "Reason", value: action.reason },
      )
      .setTimestamp()
      .setFooter({
        text: OUTCOME_CARD[outcome].footer(note),
      });
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error("couldn't log an automatic action to the mod channel", error);
  }
}

/** Runs one recorded action: auto actions run straight away, others only after a human approved them. */
export const execute = internalAction({
  args: { actionId: v.id("moderationActions") },
  returns: v.null(),
  handler: async (ctx, { actionId }): Promise<null> => {
    const action: Doc<"moderationActions"> | null = await ctx.runQuery(
      internal.moderation.get,
      { actionId },
    );
    if (!action) return null;
    const runnable =
      action.status === "approved" ||
      (action.status === "proposed" && action.auto);
    if (!runnable) return null;

    const finish = async (
      status: "executed" | "dry_run" | "skipped" | "failed",
      note?: string,
    ): Promise<null> => {
      await ctx.runMutation(internal.moderation.setResult, {
        actionId,
        status,
        note,
      });
      return null;
    };

    const bot = await discordClient();
    try {
      const channel = await bot.channels.fetch(action.channelId);
      if (!channel || channel.isDMBased() || !("guild" in channel))
        return await finish("skipped", "channel not found");
      const guild = channel.guild;
      const me = await guild.members.fetchMe();
      const member = await guild.members
        .fetch(action.targetDiscordUserId)
        .catch(() => null);

      const blocked = safetyBlock(
        guild,
        action.targetDiscordUserId,
        member,
        me,
      );
      if (blocked) {
        await logAutoAction(ctx, bot, guild, action, "skipped", blocked);
        return await finish("skipped", blocked);
      }
      if (action.action !== "delete" && action.action !== "ban" && !member)
        return await finish("skipped", "target is no longer in the server");

      const needed = ACTION_PERMISSION[action.action];
      if (!channel.permissionsFor(me)?.has(needed)) {
        const why = "the bot lacks the permission";
        await logAutoAction(ctx, bot, guild, action, "skipped", why);
        return await finish("skipped", why);
      }

      if (action.dryRun) {
        await postAlertCard(ctx, bot, guild, action, "dry_run");
        await logAutoAction(ctx, bot, guild, action, "dry_run");
        return await finish("dry_run", `dry run: would ${action.action}`);
      }

      const reason = action.reason.slice(0, 400);
      if (action.action === "delete") {
        if (!action.discordMessageId || !("messages" in channel))
          return await finish("skipped", "no message to delete");
        await channel.messages.delete(action.discordMessageId);
      } else if (action.action === "timeout") {
        await member!.timeout(
          (action.durationMinutes ?? 10) * 60 * 1000,
          reason,
        );
      } else if (action.action === "untimeout") {
        await member!.timeout(null, reason);
      } else if (action.action === "warn") {
        // A DM. If their DMs are closed this throws, and the action is recorded as failed with that reason.
        await member!.send({
          embeds: [
            new EmbedBuilder()
              .setColor(CARD_COLOR.warning)
              .setTitle("A moderator has warned you")
              .setDescription(
                `${action.reason}\n\nPlease read the community guidelines and rules before posting again.`,
              ),
          ],
        });
      } else if (action.action === "kick") {
        await member!.kick(reason);
      } else {
        // guild.bans works whether or not they are still in the server.
        await guild.bans.create(action.targetDiscordUserId, {
          reason,
          deleteMessageSeconds: (action.deleteMessageDays ?? 0) * 24 * 60 * 60,
        });
      }
      await postAlertCard(ctx, bot, guild, action, "executed");
      await logAutoAction(ctx, bot, guild, action, "executed");
      return await finish("executed");
    } catch (error) {
      return await finish(
        "failed",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      await bot.destroy();
    }
  },
});

/** Posts a proposal with Approve / Reject buttons in the mod channel. The bot process handles the clicks. */
export const postProposal = internalAction({
  args: { actionId: v.id("moderationActions") },
  returns: v.null(),
  handler: async (ctx, { actionId }) => {
    const action: Doc<"moderationActions"> | null = await ctx.runQuery(
      internal.moderation.get,
      { actionId },
    );
    if (!action || action.status !== "proposed" || action.auto) return null;
    const bot = await discordClient();
    try {
      // The mod channel is per server (set with /modchannel), so find the server the message came from.
      const source = await bot.channels.fetch(action.channelId);
      const guildId = source && "guild" in source ? source.guild.id : null;
      const modChannelId: string | null = await ctx.runQuery(
        internal.guildSettings.modChannelFor,
        { guildId },
      );
      if (!modChannelId) {
        await ctx.runMutation(internal.moderation.setResult, {
          actionId,
          status: "skipped",
          note: "No mod channel is set, so there is nowhere to ask. An admin can set one with /modchannel.",
        });
        return null;
      }
      const channel = await bot.channels.fetch(modChannelId);
      if (!channel || !("send" in channel))
        throw new Error("The mod channel isn't one the bot can send to");
      const embed = new EmbedBuilder()
        .setColor(action.dryRun ? CARD_COLOR.removed : CARD_COLOR.danger)
        .setTitle(
          `Proposed: ${action.action}${action.dryRun ? " (dry run)" : ""}`,
        )
        .addFields(
          {
            name: "Target",
            value: `<@${action.targetDiscordUserId}>`,
            inline: true,
          },
          {
            name: "Category",
            value: action.category ?? "manual",
            inline: true,
          },
          { name: "Reason", value: action.reason },
        );
      if (action.durationMinutes) {
        embed.addFields({
          name: "Duration",
          value: `${action.durationMinutes} minutes`,
          inline: true,
        });
      }
      const id = (decision: string) =>
        `mod:${decision}:${action.action}:${actionId}`;
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(id("approve"))
          .setLabel("Approve")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(id("reject"))
          .setLabel("Reject")
          .setStyle(ButtonStyle.Secondary),
      );
      const sent = await channel.send({
        embeds: [embed],
        components: [row],
        allowedMentions: { parse: [] },
      });
      await ctx.runMutation(internal.moderation.setProposalMessage, {
        actionId,
        proposalMessageId: sent.id,
      });
    } catch (error) {
      await ctx.runMutation(internal.moderation.setResult, {
        actionId,
        status: "failed",
        note: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await bot.destroy();
    }
    return null;
  },
});
