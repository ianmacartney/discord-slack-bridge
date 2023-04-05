import { internalAction } from "../_generated/server";
import { WebClient } from "@slack/web-api";

const slackClient = () => {
  const token = process.env.SLACK_TOKEN;
  if (!token) throw new Error("Specify SLACK_TOKEN in the dashboard");
  return new WebClient(token);
};

const emojiName = new Map([
  ["🪲", "beetle"],
  ["✅", "white_check_mark"],
  ["❔", "question"],
  ["🎁", "gift"],
]);

export const sendMessage = internalAction(
  async (
    { runMutation },
    { messageId, threadId, author, text, channel, threadTs, emojis }
  ) => {
    const web = slackClient();
    const result = await web.chat.postMessage({
      text: `*${author.name ?? author.username}*: ${text}`,
      channel,
      icon_url: author.avatarUrl,
      thread_ts: threadTs,
      mrkdwn: true,
    });
    if (emojis) {
      for (const emoji of emojis) {
        const name = emojiName.get(emoji);
        if (name) {
          await web.reactions.add({
            channel,
            timestamp: threadTs || result.ts,
            name,
          });
        }
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
  async ({}, { channel, messageTs, text }) => {
    const web = slackClient();
    await web.chat.update({ channel, ts: messageTs, text });
  }
);

export const deleteMessage = internalAction(
  async ({}, { channel, messageTs }) => {
    const web = slackClient();
    await web.chat.delete({ channel, ts: messageTs });
  }
);

export const updateThread = internalAction(
  async ({}, { channel, threadTs, emojis }) => {
    for (const emoji of emojis) {
      const name = emojiName.get(emoji);
      if (name) {
        await web.reactions.add({
          channel,
          timestamp: threadTs,
          name,
        });
      }
    }
  }
);
