/**
 * Iterates over only #general chat, when it sees a message that's rated as needs_help, we ask the second question: is this worth a thread?
 * Then this command is mainly for mods, admins, to just see
 */

import type { ConvexHttpClient } from "convex/browser";
import {
  ChannelType,
  ChatInputCommandInteraction,
  Guild,
  Message,
  PermissionFlagsBits as P,
  SlashCommandBuilder,
} from "discord.js";
import { api } from "./convex/_generated/api.js";
import { announceToMods } from "./modLog.js";

export const forwardFromCommand = new SlashCommandBuilder()
  .setName("forwardfrom")
  .setDescription(
    "Choose the chat channel whose long help requests become support posts",
  )
  .setDefaultMemberPermissions(P.ManageMessages)
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("set")
      .setDescription(
        "Set where help requests come from and the forum they go to",
      )
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("The chat channel to watch, for example #general")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      )
      .addChannelOption((o) =>
        o
          .setName("to")
          .setDescription("The support forum where posts are opened")
          .addChannelTypes(ChannelType.GuildForum)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName("clear").setDescription("Stop forwarding help requests"),
  )
  .addSubcommand((s) =>
    s
      .setName("status")
      .setDescription("Show the channel the bot forwards from"),
  );

export async function registerForwardFromCommand(guild: Guild) {
  await guild.commands.create(forwardFromCommand.toJSON());
}

/**
 * A moderator replies to a message with "!forward": the bot opens a support post from the replied-to message. Works in
 * any channel, with no AI check and no rate limit. Returns true when the message was a !forward command.
 */
export async function handleForwardText(
  msg: Message,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  if (msg.content.trim().toLowerCase() !== "!forward") return false;
  if (!msg.guildId || !msg.reference?.messageId) return true;
  if (!msg.member?.permissions.has(P.ManageMessages)) return true;

  const tell = async (text: string) => {
    await msg.reply({ content: text, allowedMentions: { repliedUser: false } });
  };
  try {
    const target = await msg.fetchReference();
    if (target.channel.isThread()) {
      await tell("That message is already in a thread.");
      return true;
    }
    if (!target.cleanContent.trim()) {
      await tell("That message has no text to forward.");
      return true;
    }
    const result = await convex.mutation(api.followup.requestForward, {
      guildId: msg.guildId,
      sourceChannelId: target.channelId,
      discordMessageId: target.id,
      authorDiscordId: target.author.id,
      text: target.cleanContent,
      forwardedBy: msg.author.id,
      apiToken,
    });
    if (!result.ok) {
      await tell(result.reason ?? "Couldn't forward that message.");
      return true;
    }
    // The bot's own "Opened a thread in #…" reply replaces the command, so keep the chat clean.
    await msg.delete().catch(() => {});
  } catch (e) {
    console.error(e);
    await tell("Something went wrong. Check the bot logs.");
  }
  return true;
}

export async function handleForwardFromCommand(
  interaction: ChatInputCommandInteraction,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "Use this in a server.",
      ephemeral: true,
    });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    const sub = interaction.options.getSubcommand();
    if (sub === "set") {
      const channel = interaction.options.getChannel("channel", true);
      const forum = interaction.options.getChannel("to", true);
      await convex.mutation(api.guildSettings.setForwardFrom, {
        guildId: guild.id,
        forwardFromChannelId: channel.id,
        forwardToForumId: forum.id,
        apiToken,
      });
      const change = `Long help requests in <#${channel.id}> are now forwarded to <#${forum.id}>.`;
      await interaction.editReply(change);
      await announceToMods(guild, interaction, change, convex, apiToken);
    } else if (sub === "clear") {
      await convex.mutation(api.guildSettings.setForwardFrom, {
        guildId: guild.id,
        forwardFromChannelId: null,
        forwardToForumId: null,
        apiToken,
      });
      await interaction.editReply("Forwarding to the support forum is off.");
      await announceToMods(
        guild,
        interaction,
        "Forwarding help requests to the support forum turned off.",
        convex,
        apiToken,
      );
    } else {
      const { fromChannelId, toForumId } = await convex.query(
        api.guildSettings.getForwardFrom,
        { guildId: guild.id, apiToken },
      );
      await interaction.editReply(
        fromChannelId && toForumId
          ? `Forwarding long help requests from <#${fromChannelId}> to <#${toForumId}>.`
          : "Not forwarding. Use /forwardfrom set.",
      );
    }
  } catch (e) {
    console.error(e);
    await interaction.editReply("Something went wrong. Check the bot logs.");
  }
}
