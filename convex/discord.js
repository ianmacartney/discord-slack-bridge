import { internalMutation, mutation, query } from "./_generated/server";
// import { ChannelType, Client, GatewayIntentBits } from "discord.js";

const addUnique = async (db, table, doc, primaryKey = "id") => {
  const existing = await db
    .query(table)
    .filter((q) => q.eq(q.field(primaryKey), doc[primaryKey]))
    .unique();
  if (existing) {
    return existing._id;
  }
  return await db.insert(table, doc);
};

export const receiveDiscordMessage = mutation(
  async ({ db, scheduler }, { author, message, channel, thread }) => {
    const authorId = await addUnique(db, "users", author);
    const channelId = await addUnique(db, "channels", channel);
    const dbChannel = await db.get(channelId);
    let dbThread, threadId;
    if (thread) {
      const threadId = await addUnique(db, "threads", { ...thread, channelId });
      const dbThread = await db.get(threadId);
    }
    const messageId = await addUnique(db, "messages", {
      ...message,
      authorId,
      channelId,
      threadId,
    });

    if (!author.bot && dbChannel.slackChannelId) {
      scheduler.runAfter(0, "actions/slack:sendMessage", {
        messageId,
        threadId,
        author: {
          name: author.displayName,
          username: author.username,
          avatarUrl: author.displayAvatarURL,
        },
        text: message.cleanContent,
        channel: dbChannel.slackChannelId,
        threadTs: dbThread?.slackThreadTs,
      });
    }
  }
);

export const backfillDiscordChannel = internalMutation(
  async ({ db }, { discordId }) => {
    const bot = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
      ],
    });
    const TOKEN = process.env.TOKEN;
    await bot.login(TOKEN);
    const channel = await chs.fetch(discordId);
    if (channel.type !== ChannelType.GuildForum) {
      throw new Error("Only support backfilling forums for now");
    }
    const channelId = await addUnique(
      db,
      "channels",
      serializeChannel(channel)
    );
    const { threads } = await channel.threads.fetchActive();
    for (const [, thread] of threads.entries()) {
      const threadId = await addUnique(db, "threads", {
        ...serializeThread(thread),
        channelId,
      });
      const messages = await thread.messages.fetch();
      for (const message of messages) {
        const authorId = await addUnique(db, "users", serializeUser(message));
        await addUnique(db, "messages", {
          ...serializeMessage(message),
          channelId,
          threadId,
          authorId,
        });
      }
    }
  }
);
