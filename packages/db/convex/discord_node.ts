"use node";
import { v } from "convex/values";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
import { action, internalAction } from "./_generated/server";
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
  },
});

export const resolveThread = action({
  args: {
    discordThreadId: v.string(),
  },
  handler: async (ctx, { discordThreadId }) => {
    const thread = await ctx.runQuery(
      internal.discord.getThreadByDiscordThreadId,
      {
        discordThreadId,
      },
    );
    if (!thread) {
      throw new Error(`Thread ${discordThreadId} not found in database`);
    }
    await ctx.runMutation(internal.discord.resolveThread, {
      threadId: thread._id,
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
