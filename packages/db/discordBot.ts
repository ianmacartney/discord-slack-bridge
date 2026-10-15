import { ConvexHttpClient } from "convex/browser";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  ComponentType,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} from "discord.js";
import { api } from "./convex/_generated/api.js";
import { CARD_COLOR } from "./convex/brandColors.js";
import { isTeamRole } from "./convex/violations.js";
import type { Id } from "./convex/_generated/dataModel.js";
import { handleModText } from "./modCommands.js";
import {
  handleForwardFromCommand,
  handleForwardText,
  registerForwardFromCommand,
} from "./forwardFromCommand.js";
import {
  CHANNEL_SETTING_COMMANDS,
  handleChannelSettingCommand,
  registerChannelSettingCommands,
} from "./channelSettingsCommand.js";
import {
  handleModChannelCommand,
  registerModChannelCommand,
} from "./modChannelCommand.js";
import {
  handleTagsAutocomplete,
  handleTagsCommand,
  registerTagsCommand,
} from "./tagCommand.js";
import {
  serializeAuthor,
  serializeChannel,
  serializeMessage,
  serializePartialMessage,
  serializeThread,
} from "./shared/discordUtils.js";

const apiToken = process.env.CONVEX_API_TOKEN;
if (!apiToken) throw new Error("Specify CONVEX_API_TOKEN as an env variable");

const autoReplyChannelId = process.env.AUTO_REPLY_CHANNEL_ID;
const resolvedTagId = process.env.DISCORD_RESOLVED_TAG_ID;
if (!autoReplyChannelId) {
  console.error(
    "AUTO_REPLY_CHANNEL_ID environment variable is not set: not replying.",
  );
} else {
  if (!resolvedTagId) {
    throw new Error("DISCORD_RESOLVED_TAG_ID environment variable is not set.");
  }
}

const verifiedRoleId = process.env.VERIFICATION_ROLE_ID;

const deploymentUrl = process.env.CONVEX_URL;
if (!deploymentUrl) throw new Error("Specify CONVEX_URL as an env variable");
console.log(`Server address: ${deploymentUrl}`);
const convex = new ConvexHttpClient(deploymentUrl);

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

bot.on("ready", async () => {
  console.log(`Logged in as ${bot.user?.tag}!`);
  console.log(
    `Bot is in ${bot.guilds.cache.size} guilds: ${bot.guilds.cache.map((guild) => guild.name).join(", ")}`,
  );
  for (const guild of bot.guilds.cache.values()) {
    try {
      await registerTagsCommand(guild);
    } catch (e) {
      console.error(`Could not register /tags in ${guild.name}:`, e);
    }
    try {
      await registerModChannelCommand(guild);
    } catch (e) {
      console.error(`Could not register /modchannel in ${guild.name}:`, e);
    }
    try {
      await registerForwardFromCommand(guild);
    } catch (e) {
      console.error(`Could not register /forwardfrom in ${guild.name}:`, e);
    }
    try {
      await registerChannelSettingCommands(guild);
    } catch (e) {
      console.error(`Could not register channel commands in ${guild.name}:`, e);
    }
  }
});

bot.on("messageCreate", async (msg) => {
  if (await handleForwardText(msg, convex, apiToken)) return;
  if (await handleModText(msg, convex, apiToken)) return;
  let channel, thread;
  if (
    (msg.channel.type === ChannelType.PublicThread ||
      msg.channel.type === ChannelType.PrivateThread) &&
    msg.channel.parent
  ) {
    thread = serializeThread(msg.channel);
    channel = serializeChannel(msg.channel.parent);
  } else {
    thread = undefined;
    channel = serializeChannel(msg.channel);
  }

  const args = {
    author: serializeAuthor(msg),
    message: serializeMessage(msg),
    channel,
    thread,
    pingedTeam:
      !msg.member?.roles.cache.some((r) => isTeamRole(r.name)) &&
      (msg.mentions.roles.some((r) => isTeamRole(r.name)) ||
        !!msg.mentions.members?.some((m) =>
          m.roles.cache.some((r) => isTeamRole(r.name)),
        )),
    apiToken,
  };
  console.log(
    `${args.author.username}: ${args.message.cleanContent} (${
      args.channel.id
    }/${args.thread?.id ?? ""})`,
  );
  try {
    await convex.mutation(api.discord.receiveMessage, args);
  } catch (e) {
    console.error(e);
  }
});

bot.on("messageUpdate", async (_oldMsg, newMsg) => {
  const args = {
    message: serializePartialMessage(newMsg),
    apiToken,
  };
  console.log("update message " + newMsg.id);
  try {
    await convex.mutation(api.discord.updateMessage, args);
  } catch (e) {
    console.error(e);
  }
});

bot.on("messageDelete", async (msg) => {
  console.log("delete message " + msg.id);
  try {
    await convex.mutation(api.discord.deleteMessage, { id: msg.id, apiToken });
  } catch (e) {
    console.error(e);
  }
});

bot.on("threadCreate", async (thread) => {
  console.log(`new thread ${thread.id} "${thread.name}" in ${thread.parentId}`);
  if (autoReplyChannelId && thread.parentId === autoReplyChannelId) {
    try {
      const embed = new EmbedBuilder().setColor("#d7b3cf").setDescription(
        `**Thanks for posting in <#1088161997662724167>.**
        Reminder: If you have a [Convex Pro account](https://www.convex.dev/pricing), use the [Convex Dashboard](https://dashboard.convex.dev/) to file support tickets.

        - Provide context: What are you trying to achieve, what is the end-user interaction, what are you seeing? (full error message, command output, etc.)
        - Use [search.convex.dev](https://search.convex.dev) to search Docs, Stack, and Discord all at once.
        - Additionally, you can post your questions in the Convex Community's <#1228095053885476985> channel to receive a response from AI.
        - Avoid tagging staff unless specifically instructed.

        Thank you!`,
      );

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("resolveThread")
          .setLabel("Mark as resolved")
          .setStyle(ButtonStyle.Success),
      );

      await thread.send({
        embeds: [embed],
        components: [actionRow],
      });

      const starter =
        thread.ownerId === bot.user?.id
          ? await thread.fetchStarterMessage().catch(() => null)
          : null;
      const askerId = starter?.mentions.users.first()?.id ?? thread.ownerId;
      const asker = askerId
        ? await thread.guild.members.fetch(askerId).catch(() => null)
        : null;
      if (verifiedRoleId && !asker?.roles.cache.has(verifiedRoleId)) {
        await thread.send({
          embeds: [
            new EmbedBuilder()
              .setColor("#d7b3cf")
              .setDescription(
                "Please connect your Convex account to your Discord profile to enhance our support. This connection allows us to offer you more efficient assistance and reduce spam.",
              ),
          ],
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setLabel("Verify")
                .setURL("https://dashboard.convex.dev/discord")
                .setStyle(ButtonStyle.Link),
            ),
          ],
        });
      }

      console.log(`Auto-reply sent to new support thread: ${thread.id}`);
    } catch (error) {
      console.error(`Failed to send auto-reply to thread ${thread.id}:`, error);
    }
  }
});

bot.on("threadUpdate", async (oldThread, newThread) => {
  const args = {
    previous: serializeThread(oldThread),
    thread: serializeThread(newThread),
    apiToken,
  };
  console.log("update thread " + newThread.id);
  try {
    await convex.mutation(api.discord.updateThread, args);
  } catch (e) {
    console.error(e);
  }
});

bot.on("threadDelete", async (thread) => {
  console.log("delete thread " + thread.id);
  try {
    await convex.mutation(api.discord.deleteThread, {
      id: thread.id,
      apiToken,
    });
  } catch (e) {
    console.error(e);
  }
});

const MOD_APPROVAL_PERMISSION = {
  delete: PermissionFlagsBits.ManageMessages,
  timeout: PermissionFlagsBits.ModerateMembers,
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
  warn: PermissionFlagsBits.ModerateMembers,
  untimeout: PermissionFlagsBits.ModerateMembers,
} as const;

const ALERT_PERMISSION = {
  ban: PermissionFlagsBits.BanMembers,
  kick: PermissionFlagsBits.KickMembers,
  timeout: PermissionFlagsBits.ModerateMembers,
  warn: PermissionFlagsBits.ModerateMembers,
  dismiss: PermissionFlagsBits.ModerateMembers,
} as const;
const ALERT_LABEL = {
  ban: "Ban",
  kick: "Kick",
  timeout: "Timeout (7 days)",
  warn: "Warn",
  dismiss: "Dismissed and timeout lifted",
} as const;

bot.on("error", (error) => console.error("discord client error", error));

bot.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete() && interaction.commandName === "tags") {
    await handleTagsAutocomplete(interaction, convex, apiToken);
    return;
  }
  if (interaction.isChatInputCommand() && interaction.commandName === "ping") {
    await interaction.reply("Pong!");
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "tags") {
    await handleTagsCommand(interaction, convex, apiToken);
    return;
  }

  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "forwardfrom"
  ) {
    await handleForwardFromCommand(interaction, convex, apiToken);
    return;
  }

  if (
    interaction.isChatInputCommand() &&
    interaction.commandName === "modchannel"
  ) {
    await handleModChannelCommand(interaction, convex, apiToken);
    return;
  }

  if (
    interaction.isChatInputCommand() &&
    CHANNEL_SETTING_COMMANDS.includes(interaction.commandName)
  ) {
    await handleChannelSettingCommand(interaction, convex, apiToken);
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("alert:")) {
    await interaction.deferUpdate();
    const [, choice, alertId] = interaction.customId.split(":");
    const needed = ALERT_PERMISSION[choice as keyof typeof ALERT_PERMISSION];
    if (!needed || !interaction.memberPermissions?.has(needed)) {
      await interaction.followUp({
        content: `You need permission to ${choice} members to press this.`,
        ephemeral: true,
      });
      return;
    }
    try {
      const result = await convex.mutation(api.moderation.decideAlert, {
        alertId: alertId as Id<"modAlerts">,
        choice: choice as keyof typeof ALERT_PERMISSION,
        decidedBy: interaction.user.id,
        apiToken,
      });
      const original = interaction.message.embeds[0];
      const label = ALERT_LABEL[choice as keyof typeof ALERT_LABEL];
      await interaction.editReply({
        components: [],
        embeds: original
          ? [
              EmbedBuilder.from(original)
                .setColor(CARD_COLOR.muted)
                .setFooter({
                  text: result.ok
                    ? `${label} requested by ${interaction.user.username}, see the mod channel`
                    : `Already handled (${result.status ?? "not found"})`,
                }),
            ]
          : [],
        allowedMentions: { parse: [] },
      });
    } catch (e) {
      console.error(e);
      await interaction.followUp({
        content: "Something went wrong.",
        ephemeral: true,
      });
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("tag:edit:")) {
    await interaction.deferReply({ ephemeral: true });
    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
    ) {
      await interaction.editReply({
        content: "You need Manage Messages to edit tags.",
      });
      return;
    }
    try {
      const decisionId = interaction.customId.split(
        ":",
      )[2] as Id<"tagDecisions">;
      const decision = await convex.query(api.tags.getDecisionForEdit, {
        decisionId,
        apiToken,
      });
      const thread = decision
        ? await interaction.guild?.channels.fetch(decision.discordThreadId)
        : null;
      const forum = thread?.isThread() ? thread.parent : null;
      if (!thread?.isThread() || forum?.type !== ChannelType.GuildForum) {
        await interaction.editReply({
          content: "I can't find that post any more.",
        });
        return;
      }
      const options = forum.availableTags.slice(0, 25).map((t) => ({
        label: t.name.slice(0, 100),
        value: t.id,
        default: thread.appliedTags.includes(t.id),
      }));
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`tag:pick:${decisionId}:${interaction.message.id}`)
        .setPlaceholder("Choose the tags for this post")
        .setMinValues(0)
        .setMaxValues(Math.min(5, options.length))
        .addOptions(options);
      await interaction.editReply({
        content:
          "Pick the tags this post should have. Your choice replaces its current tags.",
        components: [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
        ],
      });
    } catch (e) {
      console.error(e);
      await interaction.editReply({
        content: "Something went wrong.",
      });
    }
    return;
  }
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId.startsWith("tag:pick:")
  ) {
    await interaction.deferUpdate();
    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
    ) {
      await interaction.followUp({
        content: "You need Manage Messages to edit tags.",
        ephemeral: true,
      });
      return;
    }
    try {
      const [, , decisionId, cardMessageId] = interaction.customId.split(":");
      const decision = await convex.query(api.tags.getDecisionForEdit, {
        decisionId: decisionId as Id<"tagDecisions">,
        apiToken,
      });
      const thread = decision
        ? await interaction.guild?.channels.fetch(decision.discordThreadId)
        : null;
      const forum = thread?.isThread() ? thread.parent : null;
      if (!thread?.isThread() || forum?.type !== ChannelType.GuildForum) {
        await interaction.editReply({
          content: "I can't find that post any more.",
          components: [],
        });
        return;
      }
      const chosen = interaction.values;
      await thread.setAppliedTags(
        chosen,
        `Edited by ${interaction.user.username}`,
      );
      await convex.mutation(api.tags.recordEdit, {
        decisionId: decisionId as Id<"tagDecisions">,
        appliedTagIds: chosen,
        editedBy: interaction.user.id,
        apiToken,
      });
      const names = chosen.flatMap((id) => {
        const name = forum.availableTags.find((t) => t.id === id)?.name;
        return name ? [name] : [];
      });
      const channel = interaction.channel;
      const card =
        channel && "messages" in channel
          ? await channel.messages.fetch(cardMessageId).catch(() => null)
          : null;
      const original = card?.embeds[0];
      if (card && original) {
        await card.edit({
          embeds: [
            EmbedBuilder.from(original)
              .setFields([
                ...original.fields
                  .filter((f) => f.name !== "Edited by")
                  .map((f) => ({
                    name: f.name,
                    value:
                      f.name === "Type of thread"
                        ? names.join(", ") || "None"
                        : f.value,
                    inline: f.inline,
                  })),
                {
                  name: "Edited by",
                  value: `<@${interaction.user.id}>`,
                  inline: true,
                },
              ])
              .setFooter({ text: `Edited by ${interaction.user.username}` }),
          ],
        });
      }
      await interaction.editReply({
        content: `Tags updated: ${names.join(", ") || "none"}.`,
        components: [],
      });
    } catch (e) {
      console.error(e);
      await interaction.followUp({
        content: "Something went wrong.",
        ephemeral: true,
      });
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("tag:undo:")) {
    await interaction.deferUpdate();
    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
    ) {
      await interaction.followUp({
        content: "You need Manage Messages to undo a tag.",
        ephemeral: true,
      });
      return;
    }
    try {
      const result = await convex.mutation(api.tags.undoDecision, {
        decisionId: interaction.customId.split(":")[2] as Id<"tagDecisions">,
        undoneBy: interaction.user.id,
        apiToken,
      });
      const original = interaction.message.embeds[0];
      await interaction.editReply({
        components: [],
        embeds: original
          ? [
              (result.ok
                ? EmbedBuilder.from(original).addFields({
                    name: "Undone by",
                    value: `<@${interaction.user.id}>`,
                    inline: true,
                  })
                : EmbedBuilder.from(original)
              )
                .setColor(CARD_COLOR.muted)
                .setFooter({
                  text: result.ok
                    ? "Tags removed"
                    : `Already handled (${result.status ?? "not found"})`,
                }),
            ]
          : [],
        allowedMentions: { parse: [] },
      });
    } catch (e) {
      console.error(e);
      await interaction.followUp({
        content: "Something went wrong.",
        ephemeral: true,
      });
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("mod:")) {
    await interaction.deferUpdate();
    const [, decision, action, actionId] = interaction.customId.split(":");
    const needed =
      MOD_APPROVAL_PERMISSION[action as keyof typeof MOD_APPROVAL_PERMISSION];
    if (!needed || !interaction.memberPermissions?.has(needed)) {
      await interaction.followUp({
        content: `You need permission to ${action} members to decide this.`,
        ephemeral: true,
      });
      return;
    }
    try {
      const result = await convex.mutation(api.moderation.decide, {
        actionId: actionId as Id<"moderationActions">,
        approve: decision === "approve",
        decidedBy: interaction.user.id,
        apiToken,
      });
      await interaction.editReply({
        components: [],
        content: result.ok
          ? `${decision === "approve" ? "Approved" : "Rejected"} by <@${interaction.user.id}>`
          : `Already handled (${result.status ?? "not found"})`,
        allowedMentions: { parse: [] },
      });
    } catch (e) {
      console.error(e);
      await interaction.followUp({
        content: "Something went wrong.",
        ephemeral: true,
      });
    }
    return;
  }

  if (interaction.isButton() && interaction.customId === "resolveThread") {
    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
    ) {
      await interaction.reply({
        content: "Only moderators can change whether this is resolved.",
        ephemeral: true,
      });
      return;
    }
    await interaction.deferUpdate();
    let [button, revertButton] = [
      {
        label: "Mark as unresolved",
        style: ButtonStyle.Secondary as
          | ButtonStyle.Primary
          | ButtonStyle.Secondary,
      },
      {
        label: "Mark as resolved",
        style: ButtonStyle.Primary as
          | ButtonStyle.Primary
          | ButtonStyle.Secondary,
      },
    ];
    try {
      const thread = await bot.channels.fetch(interaction.channelId);
      if (!thread?.isThread()) {
        console.error(
          "Failed to fetch thread to resolve.",
          interaction.channelId,
          thread?.type,
        );
        return;
      }

      if (!resolvedTagId) {
        throw new Error(
          "DISCORD_RESOLVED_TAG_ID environment variable is not set.",
        );
      }

      const currentTags = thread.appliedTags;
      if (currentTags.includes(resolvedTagId)) {
        await thread.setAppliedTags(
          currentTags.filter((tag) => tag !== resolvedTagId),
        );
        [button, revertButton] = [revertButton, button];
      } else {
        await thread.setAppliedTags([...currentTags, resolvedTagId]);
      }

      await interaction.editReply({
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                customId: "resolveThread",
                type: ComponentType.Button,
                disabled: false,
                ...button,
              },
            ],
          },
        ],
      });
    } catch (error) {
      console.error("Error resolving thread:", error);

      await interaction.followUp({
        content: "Failed to resolve thread. Please try again later.",
        ephemeral: true,
      });

      await interaction.editReply({
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                customId: "resolveThread",
                type: ComponentType.Button,
                disabled: false,
                ...revertButton,
              },
            ],
          },
        ],
      });
    }
  }
});

bot.on("guildMemberAdd", async (member) => {
  try {
    await convex.action(api.verification.addRoleIfAccountLinked, {
      discordUserId: member.id,
      apiToken,
    });
  } catch (e) {
    console.error(e);
  }
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) throw "Need DISCORD_TOKEN env variable";

bot.login(DISCORD_TOKEN);
