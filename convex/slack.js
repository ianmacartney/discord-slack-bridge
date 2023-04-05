import { httpEndpoint, internalMutation } from "./_generated/server";

export const interactivityHandler = httpEndpoint(
  async ({ runMutation }, request) => {
    console.log(request);
  }
);
export const slashHandler = httpEndpoint(async ({ runMutation }, request) => {
  console.log(request);
});

export const sentMessage = internalMutation(
  async ({ db }, { messageId, threadId, messageTs }) => {
    console.log({ messageId, threadId, messageTs });
    await db.patch(messageId, { slackTs: messageTs });
    if (threadId) {
      const thread = await db.get(threadId);
      if (!thread.slackThreadTs) {
        await db.patch(threadId, { slackThreadTs: messageTs });
      }
    }
  }
);
