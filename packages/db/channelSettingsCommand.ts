import type { ConvexHttpClient } from "convex/browser";
import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  ComponentType,
  Guild,
  MessageFlags,
  PermissionFlagsBits as P,
  SlashCommandBuilder,
} from "discord.js";
import { api } from "./convex/_generated/api.js";
import { announceToMods } from "./modLog.js";

const COMMANDS = {
  ruleschannel: {
    label: "Rules channel",
    description: "Choose the rules channel the bot's reminders link to",
    max: 1,
  },
  selfpromochannel: {
    label: "Self-promo channel",
    description: "Choose where Convex-related self-promotion belongs",
    max: 1,
  },
  vip: {
    label: "VIP channels",
    description: "Choose channels where nothing is banned automatically",
    max: 25,
  },
} as const;
type Name = keyof typeof COMMANDS;

const PICK_SECONDS = 120;

export const CHANNEL_SETTING_COMMANDS = Object.keys(COMMANDS);

export async function registerChannelSettingCommands(guild: Guild) {
  for (const [name, { description }] of Object.entries(COMMANDS)) {
    await guild.commands.create(
      new SlashCommandBuilder()
        .setName(name)
        .setDescription(description)
        .setDefaultMemberPermissions(P.ManageMessages)
        .toJSON(),
    );
  }
}

const channelList = (ids: string[]) =>
  ids.length ? ids.map((id) => `<#${id}>`).join(", ") : "none";

export async function handleChannelSettingCommand(
  interaction: ChatInputCommandInteraction,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const guild = interaction.guild;
  if (!guild || !interaction.memberPermissions?.has(P.ManageMessages)) {
    await interaction.reply({
      content: "Only moderators can use this.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const name = interaction.commandName as Name;
    const { label, max } = COMMANDS[name];
    const current = await convex.query(api.guildSettings.getChannelSettings, {
      guildId: guild.id,
      apiToken,
    });
    const ids =
      name === "vip"
        ? current.vipChannelIds ?? []
        : [
            name === "ruleschannel"
              ? current.rulesChannelId
              : current.selfPromoChannelId,
          ].filter((id): id is string => !!id);

    const picker = await interaction.editReply({
      content: `${label}: ${channelList(ids)}. Pick ${max === 1 ? "one" : "any"} below, or clear it to unset.`,
      components: [
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(name)
            .setChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
              ChannelType.GuildForum,
            )
            .setMinValues(0)
            .setMaxValues(max)
            .setDefaultChannels(ids),
        ),
      ],
    });
    const pick = await picker
      .awaitMessageComponent({
        componentType: ComponentType.ChannelSelect,
        time: PICK_SECONDS * 1000,
        filter: (i) => i.user.id === interaction.user.id,
      })
      .catch(() => null);
    if (!pick) {
      await interaction.editReply({
        content: "Nothing was changed.",
        components: [],
      });
      return;
    }

    const chosen = pick.values;
    await convex.mutation(api.guildSettings.setChannelSettings, {
      guildId: guild.id,
      patch:
        name === "vip"
          ? { vipChannelIds: chosen }
          : name === "ruleschannel"
            ? { rulesChannelId: chosen[0] ?? null }
            : { selfPromoChannelId: chosen[0] ?? null },
      apiToken,
    });
    const change = `${label} set to ${channelList(chosen)}.`;
    await pick.update({ content: change, components: [] });
    await announceToMods(guild, interaction, change, convex, apiToken);
  } catch (e) {
    console.error(e);
    await interaction.editReply("Something went wrong. Check the bot logs.");
  }
}
