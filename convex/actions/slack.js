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
    {
      messageId,
      threadId,
      author,
      text,
      channel,
      channelName,
      threadTs,
      title,
      emojis,
    }
  ) => {
    const web = slackClient();
    if (threadId && !threadTs && title) {
      const threadMsg = await web.chat.postMessage({
        text: `${title} (${channelName})\n${emojis ? emojis.join(" ") : ""}`,
        channel,
        mrkdwn: true,
      });
      await runMutation("slack:startedThread", {
        threadId,
        threadTs: threadMsg.ts,
      });
      threadTs = threadMsg.ts;
    }
    const result = await web.chat.postMessage({
      text: `*${author.name ?? author.username}*: ${text}`,
      channel,
      icon_url: author.avatarUrl,
      thread_ts: threadTs,
      mrkdwn: true,
    });
    await runMutation("slack:sentMessage", {
      messageId,
      messageTs: result.ts,
    });
  }
);

export const updateMessage = internalAction(
  async ({}, { channel, messageTs, text, author }) => {
    const web = slackClient();
    await web.chat.update({
      channel,
      ts: messageTs,
      text: `*${author.name ?? author.username}*: ${text}`,
    });
  }
);

export const deleteMessage = internalAction(
  async ({}, { channel, messageTs }) => {
    const web = slackClient();
    await web.chat.delete({ channel, ts: messageTs });
  }
);

export const updateThread = internalAction(
  async ({}, { channel, threadTs, title, channelName, emojis }) => {
    const web = slackClient();
    await web.chat.update({
      channel,
      ts: threadTs,
      text: `${title} (${channelName})\n${emojis ? emojis.join(" ") : ""}`,
    });
  }
);

export const initiateReply = internalAction(
  async ({}, { slackUserId, triggerId, messageTs, message }) => {
    const web = slackClient();
    const resp = await web.views.open({
      trigger_id: triggerId,
      view: {
        private_metadata: messageTs,
        type: "modal",
        title: {
          type: "plain_text",
          text: "Reply in Discord",
          emoji: true,
        },
        submit: {
          type: "plain_text",
          text: "Reply",
          emoji: true,
        },
        close: {
          type: "plain_text",
          text: "Cancel",
          emoji: true,
        },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: message.text,
            },
          },
          {
            type: "divider",
          },
          {
            type: "input",
            block_id: "input",
            element: {
              type: "plain_text_input",
              action_id: "reply",
            },
            label: {
              type: "plain_text",
              text: "Reply",
              emoji: true,
            },
          },
        ],
      },
    });
    console.log(resp.ok);
  }
);
