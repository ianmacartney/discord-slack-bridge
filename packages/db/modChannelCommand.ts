// /modchannel: admins choose the private channel for moderator-only posts (auto-tag notes with Undo, moderation
// proposals with Approve / Reject). Stored per server in Convex, so it can change without a deploy.
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

export const modChannelCommand = new SlashCommandBuilder()
  .setName("modchannel")
  .setDescription(
    "Choose the private channel for moderator notes and proposals (admins only)",
  )
  .setDefaultMemberPermissions(P.Administrator)
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("set")
      .setDescription("Set the mod channel")
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("A private text channel")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName("clear").setDescription("Stop posting to a mod channel"),
  )
  .addSubcommand((s) =>
    s.setName("status").setDescription("Show the current mod channel"),
  );

export async function registerModChannelCommand(guild: Guild) {
  await guild.commands.create(modChannelCommand.toJSON());
}

/** Problems that would stop the bot posting there, or expose mod-only posts. Empty when it looks fine. */
async function checkChannel(guild: Guild, channelId: string) {
  const channel = await guild.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) return ["That isn't a text channel."];
  const warnings: string[] = [];
  const me = guild.members.me;
  const mine = me ? channel.permissionsFor(me) : null;
  if (!mine?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks])) {
    warnings.push(
      "I need View Channel, Send Messages and Embed Links there to post.",
    );
  }
  if (channel.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel)) {
    warnings.push(
      "Everyone can see this channel. Make it private, because moderation proposals will be posted there.",
    );
  }
  return warnings;
}

export async function handleModChannelCommand(
  interaction: ChatInputCommandInteraction,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const guild = interaction.guild;
  // Discord already hides the command from non-admins; this keeps it admin-only even if the server opens it up.
  if (!guild || !interaction.memberPermissions?.has(P.Administrator)) {
    await interaction.reply({
      content: "Only server admins can use this.",
      ephemeral: true,
    });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    const sub = interaction.options.getSubcommand();
    if (sub === "set") {
      const channel = interaction.options.getChannel("channel", true);
      const warnings = await checkChannel(guild, channel.id);
      const previous = await convex.query(api.guildSettings.getModChannel, {
        guildId: guild.id,
        apiToken,
      });
      await convex.mutation(api.guildSettings.setModChannel, {
        guildId: guild.id,
        modChannelId: channel.id,
        apiToken,
      });
      await interaction.editReply(
        [`Mod channel set to <#${channel.id}>.`, ...warnings].join("\n"),
      );
      await announceToMods(
        guild,
        interaction,
        `Mod channel set to <#${channel.id}>.`,
        convex,
        apiToken,
        channel.id,
      );
      if (previous && previous !== channel.id) {
        await announceToMods(
          guild,
          interaction,
          `Mod channel moved to <#${channel.id}>. Notes and proposals now go there.`,
          convex,
          apiToken,
          previous,
        );
      }
    } else if (sub === "clear") {
      const previous = await convex.query(api.guildSettings.getModChannel, {
        guildId: guild.id,
        apiToken,
      });
      await convex.mutation(api.guildSettings.setModChannel, {
        guildId: guild.id,
        modChannelId: null,
        apiToken,
      });
      await interaction.editReply(
        "Mod channel cleared. Notes and proposals stop being posted.",
      );
      await announceToMods(
        guild,
        interaction,
        "Mod channel cleared. Notes and proposals stop being posted.",
        convex,
        apiToken,
        previous,
      );
    } else {
      const { modChannelId } = await convex.query(api.tags.tagStatus, {
        guildId: guild.id,
        apiToken,
      });
      await interaction.editReply(
        modChannelId
          ? `Mod channel: <#${modChannelId}>.`
          : "No mod channel is set. Use /modchannel set.",
      );
    }
  } catch (e) {
    console.error(e);
    await interaction.editReply("Something went wrong. Check the bot logs.");
  }
}
