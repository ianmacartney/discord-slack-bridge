import { ChannelType, Client, GatewayIntentBits } from "discord.js";
import { ConvexHttpClient } from "convex/browser";
import {
  serializeAuthor,
  serializeChannel,
  serializeMessage,
  serializeThread,
} from "./shared/discordUtils";

const deploymentUrl = process.env.CONVEX_URL;
if (!deploymentUrl) throw new Error("Specify CONVEX_URL as an env variable");
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
  console.log(`Logged in as ${bot.user.tag}!`);
});

bot.on("messageCreate", async (msg) => {
  let channel, thread;
  if (
    msg.channel.type === ChannelType.GuildForum ||
    msg.channel.type === ChannelType.PublicThread ||
    msg.channel.type === ChannelType.PrivateThread
  ) {
    thread = serializeThread(msg.channel);
    channel = serializeChannel(msg.channel.parent);
  } else {
    thread = undefined;
    channel = msg.channel.toJSON();
    delete channel["messages"];
  }

  const args = {
    author: serializeAuthor(msg),
    message: serializeMessage(msg),
    channel,
    thread,
  };
  console.log(
    `${author.username}: ${message.cleanContent} (${channel.id}/${
      thread?.id ?? ""
    })`
  );
  // Upload to Convex
  try {
    await convex.mutation("discord:receiveMessage")(args);
  } catch (e) {
    console.error(e);
  }
});

bot.on("messageUpdate", async (oldMsg, newMsg) => {
  const args = {
    previous: oldMsg.toJSON(),
    message: newMsg.toJSON(),
  };
  console.log("update message " + newMsg.id);
  try {
    await convex.mutation("discord:updateMessage")(args);
  } catch (e) {
    console.error(e);
  }
});

bot.on("messageDelete", async (msg) => {
  console.log("delete message " + msg.id);
  try {
    await convex.mutation("discord:deleteMessage")(msg.toJSON());
  } catch (e) {
    console.error(e);
  }
});

bot.on("threadUpdate", async (oldThread, newThread) => {
  const args = {
    previous: serializeThread(oldThread),
    thread: serializeThread(newThread),
  };
  console.log("update thread " + newThread.id);
  try {
    await convex.mutation("discord:updateThread")(args);
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

const TOKEN = process.env.TOKEN;
if (!TOKEN) throw "Need TOKEN env variable";

await bot.login(TOKEN);
