import { api } from "./convex/_generated/api.js";
import {
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
} from "discord.js";
import { ConvexHttpClient } from "convex/browser";
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

bot.on("threadCreate", async (thread) => {
  // Check if the thread is in the "support-community" channel.
  if (thread.parent?.name !== "support-community") {
    return;
  }

  try {
    const embed = new EmbedBuilder().setColor("#d7b3cf").setDescription(
      `**Thanks for posting in <#1088161997662724167>.**
Just a reminder: If you have a [Convex Pro account](https://www.convex.dev/pricing), please create a support ticket through your [Convex Dashboard](https://dashboard.convex.dev/) for any support requests.

If you're on the Convex Starter plan, you can search for answers using [search.convex.dev](https://search.convex.dev), which covers docs, Stack, and Discord. Additionally, you can <@1072591948499664996> in the ⁠Convex Community <#1228095053885476985> channel.

**Posting guidelines:**
1. Provide context: What are you trying to achieve, what is the end-user interaction?
1. Include full details of what you're seeing (full error message, command output, etc.)
1. Describe what you'd like to see instead.

Please note that community support is available here, and avoid tagging staff unless specifically instructed. Thank you!`,
    );

    await thread.send({
      embeds: [embed],
    });
  } catch (error) {
    console.error(
      `Failed to send auto-reply to #support-community thread: ${thread.name}`,
      error,
    );
  }
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

bot.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("Pong!");
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
