// /askai: moderators choose the channel where people can get a quick AI answer. The needs-help follow-up mentions it
// next to the support forum. Stored per server in Convex.
import type { ConvexHttpClient } from "convex/browser";
import {
  ChannelType,
  ChatInputCommandInteraction,
  Guild,
  PermissionFlagsBits as P,
  SlashCommandBuilder,
} from "discord.js";
import { api } from "./convex/_generated/api.js";
import { announceToMods } from "./modLog.js";

export const askAiCommand = new SlashCommandBuilder()
  .setName("askai")
  .setDescription("Choose the ask-ai channel mentioned when someone needs help")
  // Moderators (anyone who can delete messages) and admins by default.
  .setDefaultMemberPermissions(P.ManageMessages)
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("set")
      .setDescription("Set the ask-ai channel")
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("The ask-ai channel")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildForum)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName("clear").setDescription("Stop mentioning an ask-ai channel"),
  )
  .addSubcommand((s) =>
    s.setName("status").setDescription("Show the current ask-ai channel"),
  );

export async function registerAskAiCommand(guild: Guild) {
  await guild.commands.create(askAiCommand.toJSON());
}

export async function handleAskAiCommand(
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
      await convex.mutation(api.guildSettings.setAskAiChannel, {
        guildId: guild.id,
        askAiChannelId: channel.id,
        apiToken,
      });
      await interaction.editReply(`Ask-ai channel set to <#${channel.id}>.`);
      await announceToMods(
        guild,
        interaction,
        `Ask-ai channel set to <#${channel.id}>.`,
        convex,
        apiToken,
      );
    } else if (sub === "clear") {
      await convex.mutation(api.guildSettings.setAskAiChannel, {
        guildId: guild.id,
        askAiChannelId: null,
        apiToken,
      });
      await interaction.editReply(
        "Ask-ai channel cleared. The follow-up only mentions the support forum.",
      );
      await announceToMods(
        guild,
        interaction,
        "Ask-ai channel cleared.",
        convex,
        apiToken,
      );
    } else {
      const channelId = await convex.query(api.guildSettings.getAskAiChannel, {
        guildId: guild.id,
        apiToken,
      });
      await interaction.editReply(
        channelId
          ? `Ask-ai channel: <#${channelId}>.`
          : "No ask-ai channel is set. Use /askai set.",
      );
    }
  } catch (e) {
    console.error(e);
    await interaction.editReply("Something went wrong. Check the bot logs.");
  }
}
