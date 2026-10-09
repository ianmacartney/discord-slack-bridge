"use node";

import { v } from "convex/values";
import { ChannelType, Client, GatewayIntentBits } from "discord.js";
import {
  serializeAuthor,
  serializeChannel,
  serializeMessage,
  serializeThread,
} from "../shared/discordUtils";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { internalAction, env } from "./_generated/server";
import { DiscordMessage, DiscordUser } from "./schema";

// Actions only send things through the REST API, so by default they ask for no privileged intents.
// The long-running bot (discordBot.ts) is what listens with Message Content and Server Members.
export const discordClient = async (
  intents: GatewayIntentBits[] = [GatewayIntentBits.Guilds],
) => {
  const bot = new Client({ intents });
  const token = env.DISCORD_TOKEN;
  if (!token) throw new Error("Specify discord DISCORD_TOKEN in the dashboard");
  await bot.login(token);
  return bot;
};

export const backfillDiscordChannel = internalAction({
  args: { discordId: v.string() },
  handler: async ({ runMutation }, { discordId }) => {
    // The backfill loads the full member list, which needs Server Members.
    const bot = await discordClient([
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent,
    ]);
    const channel = await bot.channels.fetch(discordId);
    if (!channel) {
      throw new Error(`Channel ${discordId} not found`);
    }
    if (
      channel.type !== ChannelType.GuildForum &&
      channel.type !== ChannelType.GuildText
    ) {
      throw new Error("Only supporting backfilling forums for now");
    }
    await channel.guild.members.fetch();
    const channelId = (await runMutation(internal.discord.addUniqueDoc, {
      table: "channels",
      doc: serializeChannel(channel),
    })) as Id<"channels">;
    const { threads } = await channel.threads.fetchActive();
    for (const [, thread] of threads.entries()) {
      if (thread.id !== discordId && thread.parentId !== discordId) {
        continue;
      }
      const threadId = (await runMutation(internal.discord.addUniqueDoc, {
        table: "threads",
        doc: {
          ...serializeThread(thread),
          channelId,
        },
      })) as Id<"threads">;
      const messages = await thread.messages.fetch();
      const authorsAndMessagesToAdd: [DiscordUser, DiscordMessage][] = [];
      for (const [, message] of messages) {
        if (!message.member) {
          console.log(message);
          return;
        }
        authorsAndMessagesToAdd.push([
          serializeAuthor(message),
          serializeMessage(message),
        ]);
        await runMutation(internal.discord.addThreadBatch, {
          authorsAndMessagesToAdd,
          channelId,
          threadId,
        });
      }
    }
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
  handler: async (_ctx, { threadId, tags }) => {
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
