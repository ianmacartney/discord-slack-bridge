"use node";

import { v } from "convex/values";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Channel,
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

export const ACTION_PERMISSION = {
  delete: P.ManageMessages,
  timeout: P.ModerateMembers,
  kick: P.KickMembers,
  ban: P.BanMembers,
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
  if (!member) return null;
  if (member.user.bot && env.MODERATION_ALLOW_BOT_TARGETS !== "true")
    return "target is a bot";
  if (member.permissions.any(MODERATOR_PERMISSIONS))
    return "target is an admin or moderator";
  if (member.roles.highest.comparePositionTo(me.roles.highest) >= 0)
    return "target's top role is not below the bot's";
  return null;
}

async function postAlertCard(
  ctx: ActionCtx,
  bot: Client,
  guild: Guild,
  action: Doc<"moderationActions">,
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

    const quote = alert.content.slice(0, 900) || "(no text)";
    const shown = alert.kind === "nsfw_or_violent" ? `||${quote}||` : quote;
    const embed = new EmbedBuilder()
      .setColor(CARD_COLOR.danger)
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
          value: "Message deleted, timed out for 1 day",
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

const REMINDER_SECONDS = 30;
const REMINDERS: Record<
  string,
  (rules: string, selfPromo: string, support: string) => string
> = {
  dm_solicitation: (rules, _, support) =>
    `Per the ${rules}: support tickets go through the Convex dashboard or ${support}. ` +
    "The Convex team never asks you to go to another server or get help in DMs.",
  convex_self_promo: (_, selfPromo) =>
    `Thanks for sharing! Convex projects go in ${selfPromo}, please post it there.`,
};

async function postReminder(
  ctx: ActionCtx,
  guild: Guild,
  channel: Channel,
  action: Doc<"moderationActions">,
) {
  const text = REMINDERS[action.category ?? ""];
  if (!text || !action.auto || !("send" in channel)) return;
  try {
    const { rulesChannelId, selfPromoChannelId, supportForumId } =
      await ctx.runQuery(internal.guildSettings.reminderChannelsFor, {
        guildId: guild.id,
      });
    const rules = rulesChannelId ?? guild.rulesChannelId;
    const sent = await channel.send({
      content: `<@${action.targetDiscordUserId}> ${text(
        rules ? `<#${rules}>` : "#rules",
        selfPromoChannelId
          ? `<#${selfPromoChannelId}>`
          : "the self-promo channel",
        supportForumId ? `<#${supportForumId}>` : "community-support",
      )}`,
      allowedMentions: { users: [action.targetDiscordUserId] },
    });
    await new Promise((resolve) =>
      setTimeout(resolve, REMINDER_SECONDS * 1000),
    );
    await sent.delete();
  } catch (error) {
    console.error("couldn't post a reminder", error);
  }
}

const OUTCOME_CARD = {
  executed: {
    color: CARD_COLOR.danger,
    titleSuffix: "",
    footer: () => "Done",
  },
  skipped: {
    color: CARD_COLOR.muted,
    titleSuffix: " skipped",
    footer: (note?: string) =>
      `Not done: ${note ?? "a safety check blocked it"}`,
  },
} as const;

async function logAutoAction(
  ctx: ActionCtx,
  bot: Client,
  guild: Guild,
  action: Doc<"moderationActions">,
  outcome: "executed" | "skipped",
  note?: string,
) {
  const fromChatCommand = action.category === "chat_command";
  if (!action.auto && !fromChatCommand && outcome !== "skipped") return;
  if (action.alertId && action.action === "timeout" && outcome !== "skipped")
    return;
  if (action.action === "delete" && outcome !== "skipped") return;
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
        `${action.decidedBy ? "Moderator" : "Automatic"} ${action.action}${OUTCOME_CARD[outcome].titleSuffix}`,
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
        ...(action.decidedBy
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
      status: "executed" | "skipped" | "failed",
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
        await guild.bans.create(action.targetDiscordUserId, {
          reason,
          deleteMessageSeconds: (action.deleteMessageDays ?? 0) * 24 * 60 * 60,
        });
      }
      await postAlertCard(ctx, bot, guild, action);
      await logAutoAction(ctx, bot, guild, action, "executed");
      await finish("executed");
      await postReminder(ctx, guild, channel, action);
      return null;
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

export const checkInvites = internalAction({
  args: {
    messageId: v.id("messages"),
    channelId: v.string(),
    codes: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { messageId, channelId, codes }): Promise<null> => {
    const bot = await discordClient();
    try {
      const channel = await bot.channels.fetch(channelId);
      const guildId = channel && "guild" in channel ? channel.guild.id : null;
      for (const code of codes) {
        const invite = await bot.fetchInvite(code).catch(() => null);
        if (!guildId || invite?.guild?.id !== guildId) {
          await ctx.runMutation(internal.moderation.banForInvite, {
            messageId,
            code,
          });
          return null;
        }
      }
    } finally {
      await bot.destroy();
    }
    return null;
  },
});

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
        .setColor(CARD_COLOR.danger)
        .setTitle(`Proposed: ${action.action}`)
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
