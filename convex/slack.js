import {
  httpEndpoint,
  internalMutation,
  internalQuery,
} from "./_generated/server";

export const interactivityHandler = httpEndpoint(
  async ({ runAction, runQuery }, request) => {
    const bodyParams = new URLSearchParams(await request.text());
    const body = JSON.parse(bodyParams.get("payload"));

    // "shortcut" is global shortcuts
    if (body.type === "view_submission") {
      const messageTs = body.view.private_metadata;
      console.log(body.view.state);
      const reply = body.view.state.values.input.reply.value;
      const slackUserId = body.user.id;
      const message = await runQuery("slack:getMessageByTs", { messageTs });
      const user = await runQuery("slack:getUserBySlackId", { slackUserId });
      if (message && user) {
        await runAction("actions/discord:replyFromSlack", {
          message,
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
    switch (body.callback_id) {
      // older callback ID
      case "support_resolve":
      case "resolve":
        console.log("resolve");
        console.log({ messageTs });
        await runAction("actions/discord:resolveThread", { messageTs });
        break;
      // older callback ID
      case "support_reply":
      case "reply":
        console.log("reply");
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
    if (body.callback_id === "resolve") {
    } else if (body.call)
      console.log({
        keys: [...body.keys()],
        payload: JSON.parse(body.get("payload")),
        url: request.url,
        headers: request.headers,
      });
    return new Response();
  }
);

export const getMessageByTs = internalQuery(async ({ db }, { messageTs }) => {
  return await db
    .query("messages")
    .filter((q) => q.eq(q.field("slackTs"), messageTs))
    .first();
});

export const getUserBySlackId = internalQuery(
  async ({ db }, { slackUserId }) => {
    return await db
      .query("users")
      .filter((q) => q.eq(q.field("slackUserId"), slackUserId))
      .first();
  }
);

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
