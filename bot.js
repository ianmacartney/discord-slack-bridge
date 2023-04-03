import { Client, GatewayIntentBits } from "discord.js";

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

const seen = new Set();

bot.on("messageCreate", (msg) => {
  let channel = msg.channel;
  const channels = [channel];
  while (channel.parentId) {
    channel = channel.parent;
    channels.push(channel);
  }
  const args = {
    author: seen.has(msg.author.id) ? undefined : msg.author.toJSON(),
    member: msg.member.toJSON(),
    message: msg.toJSON(),
    channels: channels
      .filter((c) => !seen.has(c.id))
      .map((c) => {
        const channel = c.toJSON();
        delete channel["messages"];
        delete channel["members"];
        delete channel["threads"];
        return channel;
      }),
  };
  console.warn("upload to convex");
  console.log(args);
  // Upload to Convex
  for (const channel of channels) {
    // upload everything for now // seen.add(channel.id);
  }
  // upload everything for now // seen.add(msg.author.id);
});

bot.on("messageUpdate", (oldMsg, newMsg) => {
  const args = {
    previous: oldMsg.toJSON(),
    message: newMsg.toJSON(),
  };
  console.log("update message");
  console.log(args);
});

bot.on("messageDelete", (msg) => {
  const args = {
    message: msg.toJSON(),
  };
  console.log("delete message");
  console.log(args);
});

bot.on("threadUpdate", (oldThread, newThread) => {
  const args = {
    previous: oldThread.toJSON(),
    thread: newThread.toJSON(),
  };
  console.log("update thread");
  console.log(args);
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
