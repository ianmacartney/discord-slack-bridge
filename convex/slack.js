import {
  httpEndpoint,
  internalMutation,
  internalQuery,
} from "./_generated/server";

// TODO: validate it came from slack
export const interactivityHandler = httpEndpoint(
  async ({ runMutation, runAction, runQuery }, request) => {
    const bodyParams = new URLSearchParams(await request.text());
    const body = JSON.parse(bodyParams.get("payload"));

    // "shortcut" is global shortcuts
    if (body.type === "view_submission") {
      const messageTs = body.view.private_metadata;
      const reply = body.view.state.values.input.reply.value;
      const slackUserId = body.user.id;
      const channelId = await runQuery("slack:getChannelIdByTs", { messageTs });
      const user = await runQuery("slack:getUserBySlackId", { slackUserId });
      if (channelId && user) {
        await runAction("actions/discord:replyFromSlack", {
          channelId,
          user,
          reply,
        });
      } else {
        console.log({
          error: "not found",
          message,
          user,
          slackUserId,
          messageTs,
        });
      }
      return new Response();
    } else if (body.type !== "message_action") {
      console.log("unknown type: " + body.type);
      console.log(JSON.stringify(body));
    }
    const messageTs = body.message_ts;
    console.log(body.callback_id);
    switch (body.callback_id) {
      // older callback ID
      case "support_resolve":
      case "resolve":
        const message = await runQuery("slack:getMessageByTs", { messageTs });
        if (message?.threadId) {
          await runMutation("discord:resolveThread", {
            threadId: message.threadId,
          });
        } else {
          console.log("No thread to resolve");
        }
        break;
      // older callback ID
      case "support_reply":
      case "reply":
        const slackUserId = body.user.id;
        const triggerId = body.trigger_id;
        console.log({ slackUserId, triggerId, messageTs });
        await runAction("actions/slack:initiateReply", {
          slackUserId,
          triggerId,
          messageTs,
          message: body.message,
        });
        break;
      default:
        console.log("unknown callback_id: " + body.callback_id);
        console.log(JSON.stringify(body));
    }
    return new Response();
  }
);

export const getMessageByTs = internalQuery(async ({ db }, { messageTs }) => {
  let message = await db
    .query("messages")
    .filter((q) => q.eq(q.field("slackTs"), messageTs))
    .first();
  if (!message) {
    console.log("looking for thread");
    const thread = await db
      .query("threads")
      .filter((q) => q.eq(q.field("slackThreadTs"), messageTs))
      .first();
    if (thread) {
      console.log("looking for first message " + thread._id.id);
      message = await db
        .query("messages")
        .filter((q) => q.eq(q.field("threadId"), thread._id))
        .first();
    }
  }
  return message;
});

// Important: this is the Discord channel.id, not the Doc<"channels">._id
export const getChannelIdByTs = internalQuery(async ({ db }, { messageTs }) => {
  const thread = await db
    .query("threads")
    .filter((q) => q.eq(q.field("slackThreadTs"), messageTs))
    .first();
  if (thread) {
    return thread.id;
  }
  const message = await db
    .query("messages")
    .filter((q) => q.eq(q.field("slackTs"), messageTs))
    .first();
  if (message && message.threadId) {
    const thread = await db.get(message.threadId);
    return thread.id;
  }
  return null;
});

export const getUserBySlackId = internalQuery(
  async ({ db }, { slackUserId }) => {
    return await db
      .query("users")
      .filter((q) => q.eq(q.field("slackUserId"), slackUserId))
      .first();
  }
);

// TODO: validate it came from slack
export const slashHandler = httpEndpoint(async ({ runMutation }, request) => {
  console.log(request);
  return new Response();
});

export const startedThread = internalMutation(
  async ({ db }, { threadId, threadTs }) => {
    await db.patch(threadId, { slackThreadTs: threadTs });
  }
);
export const sentMessage = internalMutation(
  async ({ db }, { messageId, messageTs }) => {
    await db.patch(messageId, { slackTs: messageTs });
  }
);
