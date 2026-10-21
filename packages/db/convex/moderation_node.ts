"use node";

import { v } from "convex/values";
import {
  ActionRowBuilder,
  APIChannel,
  APIDMChannel,
  APIGuild,
  APIGuildMember,
  APIInvite,
  APIUser,
  ButtonBuilder,
  ButtonStyle,
  DiscordAPIError,
  EmbedBuilder,
  REST,
  RESTJSONErrorCodes,
  Routes,
} from "discord.js";
import { isModerator, outranksMember } from "../shared/memberChecks";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { ActionCtx, env, internalAction } from "./_generated/server";
import { CARD_COLOR } from "./brandColors";
import { VIOLATION_TITLES } from "./violations";
import { discordRest, sendMessage } from "./discord_node";

function safetyBlock(
  guild: APIGuild,
  targetId: string,
  member: APIGuildMember | null,
  me: APIGuildMember,
) {
  const exempt = (env.MODERATION_EXEMPT_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim());
  if (exempt.includes(targetId)) return "target is on the exempt list";
  if (targetId === me.user.id) return "target is the moderation bot itself";
  if (targetId === guild.owner_id) return "target is the server owner";
  if (!member) return null;
  if (member.user.bot && env.MODERATION_ALLOW_BOT_TARGETS !== "true")
    return "target is a bot";
  if (isModerator(guild, member)) return "target is an admin or moderator";
  if (!outranksMember(guild, me, member))
    return "target's top role is not below the bot's";
  return null;
}

async function postAlertCard(
  ctx: ActionCtx,
  rest: REST,
  guildId: string,
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
      { guildId },
    );
    if (!modChannelId) return;

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
    const sent = await sendMessage(rest, modChannelId, {
      embeds: [embed.toJSON()],
      components: [row.toJSON()],
      allowed_mentions: { parse: [] },
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
  rest: REST,
  guild: APIGuild,
  channelId: string,
  action: Doc<"moderationActions">,
) {
  const text = REMINDERS[action.category ?? ""];
  if (!text || !action.auto) return;
  try {
    const { rulesChannelId, selfPromoChannelId, supportForumId } =
      await ctx.runQuery(internal.guildSettings.reminderChannelsFor, {
        guildId: guild.id,
      });
    const rules = rulesChannelId ?? guild.rules_channel_id;
    const sent = await sendMessage(rest, channelId, {
      content: `<@${action.targetDiscordUserId}> ${text(
        rules ? `<#${rules}>` : "#rules",
        selfPromoChannelId
          ? `<#${selfPromoChannelId}>`
          : "the self-promo channel",
        supportForumId ? `<#${supportForumId}>` : "community-support",
      )}`,
      allowed_mentions: { users: [action.targetDiscordUserId] },
    });
    await new Promise((resolve) =>
      setTimeout(resolve, REMINDER_SECONDS * 1000),
    );
    await rest.delete(Routes.channelMessage(channelId, sent.id));
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
  rest: REST,
  guildId: string,
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
      { guildId },
    );
    if (!modChannelId) return;
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
    await sendMessage(rest, modChannelId, {
      embeds: [embed.toJSON()],
      allowed_mentions: { parse: [] },
    });
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

    const rest = discordRest();
    try {
      const channel = (await rest.get(
        Routes.channel(action.channelId),
      )) as APIChannel;
      if (!("guild_id" in channel) || !channel.guild_id)
        return await finish("skipped", "channel not found");
      const guildId = channel.guild_id;
      const target = action.targetDiscordUserId;
      const [guild, botUser] = await Promise.all([
        rest.get(Routes.guild(guildId)) as Promise<APIGuild>,
        rest.get(Routes.user()) as Promise<APIUser>,
      ]);
      const [me, member] = await Promise.all([
        rest.get(
          Routes.guildMember(guildId, botUser.id),
        ) as Promise<APIGuildMember>,
        (
          rest.get(
            Routes.guildMember(guildId, target),
          ) as Promise<APIGuildMember>
        ).catch(() => null),
      ]);

      const blocked = safetyBlock(guild, target, member, me);
      if (blocked) {
        await logAutoAction(ctx, rest, guildId, action, "skipped", blocked);
        return await finish("skipped", blocked);
      }
      if (action.action !== "delete" && action.action !== "ban" && !member)
        return await finish("skipped", "target is no longer in the server");

      const reason = action.reason.slice(0, 400);
      try {
        if (action.action === "delete") {
          if (!action.discordMessageId)
            return await finish("skipped", "no message to delete");
          await rest.delete(
            Routes.channelMessage(action.channelId, action.discordMessageId),
          );
        } else if (
          action.action === "timeout" ||
          action.action === "untimeout"
        ) {
          const until =
            action.action === "timeout"
              ? new Date(
                  Date.now() + (action.durationMinutes ?? 10) * 60 * 1000,
                ).toISOString()
              : null;
          await rest.patch(Routes.guildMember(guildId, target), {
            body: { communication_disabled_until: until },
            reason,
          });
        } else if (action.action === "warn") {
          const dm = (await rest.post(Routes.userChannels(), {
            body: { recipient_id: target },
          })) as APIDMChannel;
          await sendMessage(rest, dm.id, {
            embeds: [
              new EmbedBuilder()
                .setColor(CARD_COLOR.warning)
                .setTitle("A moderator has warned you")
                .setDescription(
                  `${action.reason}\n\nPlease read the community guidelines and rules before posting again.`,
                )
                .toJSON(),
            ],
          });
        } else if (action.action === "kick") {
          await rest.delete(Routes.guildMember(guildId, target), { reason });
        } else {
          await rest.put(Routes.guildBan(guildId, target), {
            body: {
              delete_message_seconds:
                (action.deleteMessageDays ?? 0) * 24 * 60 * 60,
            },
            reason,
          });
        }
      } catch (error) {
        if (
          error instanceof DiscordAPIError &&
          error.code === RESTJSONErrorCodes.MissingPermissions
        ) {
          const why = "the bot lacks the permission";
          await logAutoAction(ctx, rest, guildId, action, "skipped", why);
          return await finish("skipped", why);
        }
        throw error;
      }
      await postAlertCard(ctx, rest, guildId, action);
      await logAutoAction(ctx, rest, guildId, action, "executed");
      await finish("executed");
      await postReminder(ctx, rest, guild, action.channelId, action);
      return null;
    } catch (error) {
      return await finish(
        "failed",
        error instanceof Error ? error.message : String(error),
      );
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
    const rest = discordRest();
    const channel = (await rest.get(Routes.channel(channelId))) as APIChannel;
    const guildId = "guild_id" in channel ? channel.guild_id : null;
    for (const code of codes) {
      const invite = (await rest
        .get(Routes.invite(code))
        .catch(() => null)) as APIInvite | null;
      if (!guildId || invite?.guild?.id !== guildId) {
        await ctx.runMutation(internal.moderation.banForInvite, {
          messageId,
          code,
        });
        return null;
      }
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
    const rest = discordRest();
    try {
      const source = (await rest.get(
        Routes.channel(action.channelId),
      )) as APIChannel;
      const guildId = ("guild_id" in source && source.guild_id) || null;
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
      const sent = await sendMessage(rest, modChannelId, {
        embeds: [embed.toJSON()],
        components: [row.toJSON()],
        allowed_mentions: { parse: [] },
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
    }
    return null;
  },
});
