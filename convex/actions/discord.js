import {
  serializeAuthor,
  serializeChannel,
  serializeMessage,
  serializeThread,
} from "../../shared/discordUtils";
import { internalAction } from "../_generated/server";
import { ChannelType, Client, GatewayIntentBits } from "discord.js";

export const backfillDiscordChannel = internalAction(
  async ({ runMutation }, { discordId }) => {
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
  }
);

export const replyFromSlack = internalAction(
  async ({ runMutation }, { message, user, reply }) => {
    console.log(message.threadId, message.channelId, user.id, reply);
  }
);

export const resolveThread = internalAction(async ({ runMutation }, args) => {
  console.log(args);
});
