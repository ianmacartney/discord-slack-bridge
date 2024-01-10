"use node";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { WebClient } from "@slack/web-api";
import { v } from "convex/values";

const slackClient = () => {
  const token = process.env.SLACK_TOKEN;
  if (!token) throw new Error("Specify SLACK_TOKEN in the dashboard");
  return new WebClient(token);
};

const author = v.object({
  name: v.string(),
  username: v.string(),
  avatarUrl: v.optional(v.string()),
});

export const sendMessage = internalAction({
  args: {
    messageId: v.id("messages"),
    threadId: v.optional(v.id("threads")),
    author,
    text: v.string(),
    channel: v.string(),
    channelName: v.string(),
    linkUrl: v.optional(v.string()),
    threadTs: v.optional(v.string()),
    title: v.optional(v.string()),
    emojis: v.optional(v.array(v.string())),
  },
  handler: async (
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
      await runMutation(internal.slack.startedThread, {
        threadId,
        threadTs: threadMsg.ts!,
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
    await runMutation(internal.slack.sentMessage, {
      messageId,
      messageTs: result.ts!,
    });
  },
});

function threadMessage(
  title: string,
  channelName: string,
  linkUrl?: string,
  emojis?: string[]
) {
  return `${title} (${channelName})\n${linkUrl ? linkUrl + " \n" : ""}${
    emojis ? emojis.join(" ") : ""
  }`;
}

export const updateMessage = internalAction({
  args: {
    channel: v.string(),
    messageTs: v.string(),
    text: v.string(),
    author,
  },
  handler: async ({}, { channel, messageTs, text, author }) => {
    const web = slackClient();
    await web.chat.update({
      channel,
      ts: messageTs,
      text: `*${author.name ?? author.username}*: ${text}`,
    });
  },
});

export const deleteMessage = internalAction({
  args: {
    channel: v.string(),
    messageTs: v.string(),
  },
  handler: async ({}, { channel, messageTs }) => {
    const web = slackClient();
    await web.chat.delete({ channel, ts: messageTs });
  },
});

export const updateThread = internalAction({
  args: {
    channel: v.string(),
    threadTs: v.string(),
    title: v.string(),
    channelName: v.string(),
    emojis: v.optional(v.array(v.string())),
    linkUrl: v.optional(v.string()),
  },
  handler: async (
    {},
    { channel, threadTs, title, channelName, emojis, linkUrl }
  ) => {
    const web = slackClient();
    await web.chat.update({
      channel,
      ts: threadTs,
      text: threadMessage(title, channelName, linkUrl, emojis),
    });
  },
});

export const initiateReply = internalAction({
  args: {
    slackUserId: v.string(),
    triggerId: v.string(),
    messageTs: v.string(),
    message: v.string(),
  },
  handler: async ({}, { slackUserId, triggerId, messageTs, message }) => {
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
              text: message,
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
  },
});
