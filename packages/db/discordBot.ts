import { ConvexHttpClient } from "convex/browser";
import {
  ButtonStyle,
  ChannelType,
  Client,
  ComponentType,
  GatewayIntentBits,
} from "discord.js";
import { api } from "./convex/_generated/api.js";
import {
  serializeAuthor,
  serializeChannel,
  serializeMessage,
  serializePartialMessage,
  serializeThread,
} from "./shared/discordUtils.js";

const apiToken = process.env.CONVEX_API_TOKEN;
if (!apiToken) throw new Error("Specify CONVEX_API_TOKEN as an env variable");

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

bot.on("ready", () => {
  console.log(`Logged in as ${bot.user?.tag}!`);
  console.log(
    `Bot is in ${bot.guilds.cache.size} guilds: ${bot.guilds.cache.map((guild) => guild.name).join(", ")}`,
  );
});

bot.on("messageCreate", async (msg) => {
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
    apiToken,
  };
  console.log(
    `${args.author.username}: ${args.message.cleanContent} (${
      args.channel.id
    }/${args.thread?.id ?? ""})`,
  );
  // Upload to Convex
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

bot.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === "ping") {
    await interaction.reply("Pong!");
  }

  if (interaction.isButton() && interaction.customId === "resolveThread") {
    try {
      const thread = await bot.channels.fetch(interaction.channelId);
      if (!thread?.isThread()) {
        throw new Error("Failed to fetch thread to resolve.");
      }

      const resolvedTagId = process.env.DISCORD_RESOLVED_TAG_ID;
      if (!resolvedTagId) {
        throw new Error(
          "DISCORD_RESOLVED_TAG_ID environment variable is not set.",
        );
      }

      // Add the 'resolved' tag to the thread.
      const currentTags = thread.appliedTags;
      if (!currentTags.includes(resolvedTagId)) {
        await thread.setAppliedTags([...currentTags, resolvedTagId]);
      }

      // Update button to resolved state.
      await interaction.update({
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                label: "Resolved!",
                style: ButtonStyle.Success,
                customId: "resolveThread",
                disabled: true,
              },
            ],
          },
        ],
      });
    } catch (error) {
      console.error("Error resolving thread:", error);

      // Send error message to indicate it failed to resolve.
      await interaction.followUp({
        content: "Failed to resolve thread. Please try again later.",
        ephemeral: true,
      });

      // Revert to original state so the user can try again.
      await interaction.update({
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                label: "Mark as resolved",
                style: ButtonStyle.Primary,
                customId: "resolveThread",
                disabled: false,
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
