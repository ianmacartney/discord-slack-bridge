"use node";
import {
  serializeAuthor,
  serializeChannel,
  serializeMessage,
  serializeThread,
} from "../../shared/discordUtils";
import { internalAction } from "../_generated/server";
import { ChannelType, Client, GatewayIntentBits } from "discord.js";

const discordClient = async () => {
  const bot = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent,
    ],
  });
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error("Specify discord DISCORD_TOKEN in the dashboard");
  await bot.login(token);
  return bot;
};

export const backfillDiscordChannel = internalAction(
  async ({ runMutation }, { discordId }) => {
    const bot = await discordClient();
    const channel = await bot.channels.fetch(discordId);
    await channel.guild.members.fetch();
    if (channel.type !== ChannelType.GuildForum) {
      throw new Error("Only support backfilling forums for now");
    }
    const channelId = await runMutation("discord:addUniqueDoc", {
      table: "channels",
      doc: serializeChannel(channel),
    });
    const { threads } = await channel.threads.fetchActive();
    for (const [, thread] of threads.entries()) {
      if (thread.id !== discordId && thread.parentId !== discordId) {
        continue;
      }
      const threadId = await runMutation("discord:addUniqueDoc", {
        table: "threads",
        doc: {
          ...serializeThread(thread),
          channelId,
        },
      });
      const messages = await thread.messages.fetch();
      const authorsAndMessagesToAdd = [];
      for (const [, message] of messages) {
        if (!message.member) {
          console.log(message);
          return;
        }
        authorsAndMessagesToAdd.push([
          serializeAuthor(message),
          { ...serializeMessage(message), channelId, threadId },
        ]);
        await runMutation("discord:addThreadBatch", {
          authorsAndMessagesToAdd,
        });
      }
    }
    // Reset all versions as new for search indexing.
    await runMutation("discord:forceRefreshVersions", {});
  }
);

export const replyFromSlack = internalAction(
  async ({}, { channelId, user, reply }) => {
    console.log(channelId, user.id, reply);
    const bot = await discordClient();
    const channel = await bot.channels.fetch(channelId);

    await channel.send(`<@${user.id}>: ${reply}`);
  }
);

export const applyTags = internalAction(async ({}, { threadId, tags }) => {
  const bot = await discordClient();
  const thread = await bot.channels.fetch(threadId);
  await thread.setAppliedTags(tags);
});
