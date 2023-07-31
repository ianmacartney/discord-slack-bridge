"use node";
import { internalAction } from "../_generated/server";
import { WebClient } from "@slack/web-api";

const slackClient = () => {
  const token = process.env.SLACK_TOKEN;
  if (!token) throw new Error("Specify SLACK_TOKEN in the dashboard");
  return new WebClient(token);
};

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
      linkUrl,
      threadTs,
      title,
      emojis,
    }
  ) => {
    const web = slackClient();
    if (threadId && !threadTs && title) {
      const threadMsg = await web.chat.postMessage({
        text: threadMessage(title, channelName, linkUrl, emojis),
        channel,
        // XXX Hack:
        // Generic discord URL. Hopfully busts the slack cache
        // so it doesn't say Webhook URL?
        icon_url: "https://cdn.discordapp.com/embed/avatars/2.png",
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

function threadMessage(title, channelName, linkUrl, emojis) {
  return `${title} (${channelName})\n${linkUrl ? linkUrl + " \n" : ""}${
    emojis ? emojis.join(" ") : ""
  }`;
}

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
  async ({}, { channel, threadTs, title, channelName, emojis, linkUrl }) => {
    const web = slackClient();
    await web.chat.update({
      channel,
      ts: threadTs,
      text: threadMessage(title, channelName, linkUrl, emojis),
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
    console.log({ success: resp.ok });
  }
);
