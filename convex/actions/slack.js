import { internalAction } from "../_generated/server";
import { WebClient } from "@slack/web-api";

export const sendMessage = internalAction(
  async (
    { runMutation },
    { messageId, threadId, author, text, channel, threadTs, emojis }
  ) => {
    const token = process.env.SLACK_TOKEN;
    if (!token) throw new Error("Specify SLACK_TOKEN in the dashboard");
    const web = new WebClient(token);
    const result = await web.chat.postMessage({
      text: `*${author.name ?? author.username}*: ${text}`,
      channel,
      icon_url: author.avatarUrl,
      thread_ts: threadTs,
      mrkdwn: true,
    });
    if (emojis) {
      for (const emoji of emojis) {
        await web.reactions.add({
          channel,
          timestamp: threadTs || result.ts,
          name: emoji,
        });
      }
    }
    await runMutation("slack:sentMessage", {
      messageId,
      threadId,
      messageTs: result.ts,
    });
  }
);

export const updateMessage = internalAction(
  async ({}, { channel, messageTs }) => {}
);

export const deleteMessage = internalAction(
  async ({}, { channel, messageTs }) => {}
);

export const updateThread = internalAction(
  async ({}, { channel, threadTs, emojis }) => {
    for (const emoji of emojis) {
      await web.reactions.add({ channel, timestamp: threadTs, name: emoji });
    }
  }
);
