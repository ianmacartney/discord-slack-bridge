import { httpEndpoint, internalMutation } from "./_generated/server";

export const interactivityHandler = httpEndpoint(
  async ({ runMutation }, request) => {
    console.log(request);
  }
);
export const slashHandler = httpEndpoint(async ({ runMutation }, request) => {
  console.log(request);
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
