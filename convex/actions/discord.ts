"use node";
import { v } from "convex/values";
import {
  serializeAuthor,
  serializeChannel,
  serializeMessage,
  serializeThread,
} from "../../shared/discordUtils";
import { internalAction } from "../_generated/server";
import { ChannelType, Client, GatewayIntentBits } from "discord.js";
import { WithoutSystemFields } from "convex/server";
import { Doc } from "../_generated/dataModel";

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

export const backfillDiscordChannel = internalAction({
  args: { discordId: v.string() },
  handler: async ({ runMutation }, { discordId }) => {
    const bot = await discordClient();
    const channel = await bot.channels.fetch(discordId);
    if (!channel) {
      throw new Error(`Channel ${discordId} not found`);
    }
    if (channel.type !== ChannelType.GuildForum) {
      throw new Error("Only supporting backfilling forums for now");
    }
    await channel.guild.members.fetch();
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
      const authorsAndMessagesToAdd: [
        WithoutSystemFields<Doc<"users">>,
        WithoutSystemFields<Doc<"messages">>
      ][] = [];
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
  },
});

export const replyFromSlack = internalAction({
  args: {
    channelId: v.string(),
    userId: v.id("users"),
    reply: v.string(),
  },
  handler: async ({}, { channelId, userId, reply }) => {
    console.log(channelId, userId, reply);
    const bot = await discordClient();
    const channel = await bot.channels.fetch(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }
    if (!("send" in channel)) {
      throw new Error("Cannot reply to categories");
    }

    await channel.send(`<@${userId}>: ${reply}`);
  },
});

export const applyTags = internalAction({
  args: {
    threadId: v.string(),
    tags: v.array(v.string()),
  },
  handler: async (ctx, { threadId, tags }) => {
    const bot = await discordClient();
    const thread = await bot.channels.fetch(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`);
    }
    if (thread.type !== ChannelType.PublicThread) {
      throw new Error("Can only set tags on threads");
    }
    await thread.setAppliedTags(tags);
  },
});
