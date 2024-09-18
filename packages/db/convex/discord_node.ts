"use node";
import { v } from "convex/values";
import {
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
} from "discord.js";
import {
  serializeAuthor,
  serializeChannel,
  serializeMessage,
  serializeThread,
} from "../shared/discordUtils";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { DiscordMessage, DiscordUser } from "./schema";

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

export const replyToSupportThread = internalAction({
  args: {
    threadId: v.string(),
  },
  handler: async ({}, { threadId }) => {
    const bot = await discordClient();

    const thread = await bot.channels.fetch(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`);
    }
    if (
      thread.type !== ChannelType.PublicThread &&
      thread.type !== ChannelType.PrivateThread
    ) {
      throw new Error("Can only reply to threads");
    }

    const embed = new EmbedBuilder().setColor("#d7b3cf").setDescription(
      `**Thanks for posting in <#1088161997662724167>.**
Just a reminder: If you have a [Convex Pro account](https://www.convex.dev/pricing), please create a support ticket through your [Convex Dashboard](https://dashboard.convex.dev/) for any support requests.

You can search for answers using [search.convex.dev](https://search.convex.dev), which covers docs, Stack, and Discord. Additionally, you can post in the <#1228095053885476985> channel to get a response from <@1072591948499664996>.

**Posting guidelines:**
1. Provide context: What are you trying to achieve, what is the end-user interaction?
1. Include full details of what you're seeing (full error message, command output, etc.)
1. Describe what you'd like to see instead.

Please note that community support is available here, and avoid tagging staff unless specifically instructed. Thank you!`,
    );

    await thread.send({
      embeds: [embed],
    });
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
