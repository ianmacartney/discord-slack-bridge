import type { ConvexHttpClient } from "convex/browser";
import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ChatInputCommandInteraction,
  ComponentType,
  Guild,
  PermissionFlagsBits as P,
  SlashCommandBuilder,
} from "discord.js";
import { api } from "./convex/_generated/api.js";
import { announceToMods } from "./modLog.js";

const SINGLE = {
  ruleschannel: {
    field: "rulesChannelId",
    label: "Rules channel",
    description: "Choose the rules channel the bot's reminders link to",
    unset:
      "No rules channel is set, so reminders use the server's own rules channel.",
  },
  selfpromochannel: {
    field: "selfPromoChannelId",
    label: "Self-promo channel",
    description: "Choose where Convex-related self-promotion belongs",
    unset:
      "No self-promo channel is set, so self-promotion is left where it is.",
  },
} as const;

const textChannels = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
] as const;

const singleCommand = (name: keyof typeof SINGLE) =>
  new SlashCommandBuilder()
    .setName(name)
    .setDescription(`${SINGLE[name].description} (admins only)`)
    .setDefaultMemberPermissions(P.Administrator)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription(`Set the ${SINGLE[name].label.toLowerCase()}`)
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("The channel")
            .addChannelTypes(...textChannels)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) => s.setName("clear").setDescription("Unset it"))
    .addSubcommand((s) => s.setName("status").setDescription("Show it"));

const PICK_SECONDS = 120;

const vipCommand = new SlashCommandBuilder()
  .setName("vip")
  .setDescription(
    "VIP channels: nothing there is banned automatically, mods decide from a card (admins only)",
  )
  .setDefaultMemberPermissions(P.Administrator)
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("set")
      .setDescription("Pick the VIP channels, as many as you like"),
  )
  .addSubcommand((s) =>
    s.setName("list").setDescription("Show the VIP channels"),
  )
  .addSubcommand((s) =>
    s.setName("clear").setDescription("Remove all VIP channels"),
  );

export const CHANNEL_SETTING_COMMANDS = [
  "ruleschannel",
  "selfpromochannel",
  "vip",
];

const channelList = (ids: string[]) =>
  ids.length ? ids.map((id) => `<#${id}>`).join(", ") : "none";

export async function registerChannelSettingCommands(guild: Guild) {
  await guild.commands.create(singleCommand("ruleschannel").toJSON());
  await guild.commands.create(singleCommand("selfpromochannel").toJSON());
  await guild.commands.create(vipCommand.toJSON());
}

export async function handleChannelSettingCommand(
  interaction: ChatInputCommandInteraction,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const guild = interaction.guild;
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
    const current = await convex.query(api.guildSettings.getChannelSettings, {
      guildId: guild.id,
      apiToken,
    });
    const save = (patch: Partial<typeof current>) =>
      convex.mutation(api.guildSettings.setChannelSettings, {
        guildId: guild.id,
        patch,
        apiToken,
      });
    let change: string | null = null;
    let reply: string;

    if (interaction.commandName === "vip") {
      const ids = current.vipChannelIds ?? [];
      if (sub === "list") {
        reply = `VIP channels: ${channelList(ids)}.`;
      } else if (sub === "clear") {
        await save({ vipChannelIds: [] });
        change = reply = "VIP channels cleared.";
      } else {
        const picker = await interaction.editReply({
          content: "Pick the VIP channels.",
          components: [
            new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId("vip")
                .setChannelTypes(...textChannels)
                .setMinValues(0)
                .setMaxValues(25)
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
        await save({ vipChannelIds: pick.values });
        change = `VIP channels set to ${channelList(pick.values)}.`;
        await pick.update({ content: change, components: [] });
        await announceToMods(guild, interaction, change, convex, apiToken);
        return;
      }
    } else {
      const { field, label, unset } =
        SINGLE[interaction.commandName as keyof typeof SINGLE];
      if (sub === "set") {
        const id = interaction.options.getChannel("channel", true).id;
        await save({ [field]: id });
        change = reply = `${label} set to <#${id}>.`;
      } else if (sub === "clear") {
        await save({ [field]: null });
        change = reply = `${label} cleared.`;
      } else {
        const id = current[field];
        reply = id ? `${label}: <#${id}>.` : unset;
      }
    }

    await interaction.editReply(reply);
    if (change) {
      await announceToMods(guild, interaction, change, convex, apiToken);
    }
  } catch (e) {
    console.error(e);
    await interaction.editReply("Something went wrong. Check the bot logs.");
  }
}
