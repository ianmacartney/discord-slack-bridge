// Jev-backed message classifier. classifyMessage runs on every new message (see receiveMessage in discord.ts).
// It can also be called by hand, for example:
//   npx convex run classify:classifyMessage '{"messageId": "..."}'
import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { decide } from "./decisions";
import { THRESHOLD_DEFAULTS } from "./violations";

const MAX_MESSAGE_CHARS = 4000;

export const MESSAGE_CATEGORIES = {
  normal: "Ordinary conversation that needs no action.",
  needs_help:
    "Someone is asking for help or reporting a problem they want solved.",
  spam:
    "Unsolicited promotion, scams, repeated junk, bot-like repetition, repeated self-promotion, " +
    "or links with no relevance to the conversation.",
  nsfw_or_violent:
    "NSFW content, graphic violence, discrimination, or doxxing (sharing someone's personal information).",
  job_solicitation:
    "Advertising availability for work, or hiring, for roles unrelated to Convex.",
  piracy_or_secrets:
    "Sharing or requesting pirated software, stolen or leaked API keys, or copyrighted material.",
  ragebait:
    "Written to provoke anger or arguments rather than to discuss, such as inflammatory or trolling remarks.",
  harassment: "Insults, threats, or targeted abuse aimed at a person or group.",
  off_topic: "Harmless but unrelated to the server's purpose.",
};

// export const ACTION_NEEDED = {
//   ban: "When it's purely not worth keeping around.",
//   timeout:"",
//   kick:""
// }

const messageForClassification = v.object({
  text: v.string(),
  author: v.string(),
  threadName: v.optional(v.string()),
});

export const getMessageForClassification = internalQuery({
  args: { messageId: v.id("messages") },
  returns: v.union(v.null(), messageForClassification),
  handler: async ({ db }, { messageId }) => {
    const message = await db.get("messages", messageId);
    if (!message || !message.cleanContent.trim()) return null;
    const [author, thread] = await Promise.all([
      db.get("users", message.authorId),
      message.threadId ? db.get("threads", message.threadId) : null,
    ]);
    return {
      text: message.cleanContent.slice(0, MAX_MESSAGE_CHARS),
      author: author?.displayName ?? author?.username ?? "unknown",
      threadName: thread?.name,
    };
  },
});

const messageClassification = v.object({
  category: v.string(),
  confidence: v.optional(v.number()),
  probabilities: v.optional(v.record(v.string(), v.number())),
});

/** Returns null when the message is missing or has no text (embeds, system messages). */
export const classifyMessage = internalAction({
  args: { messageId: v.id("messages") },
  returns: v.union(v.null(), messageClassification),
  handler: async (
    ctx,
    { messageId },
  ): Promise<Infer<typeof messageClassification> | null> => {
    const message: Infer<typeof messageForClassification> | null =
      await ctx.runQuery(internal.classify.getMessageForClassification, {
        messageId,
      });

    if (!message) return null;

    const { answers } = await decide(
      {
        message: message.text,
        author: message.author,
        thread: message.threadName,
      },
      {
        category: {
          type: "choice",
          instructions: "Which category best describes this Discord message?",
          criteria: MESSAGE_CATEGORIES,
        },
      },
    );

    const answer = answers.category;
    if (answer.type !== "choice")
      throw new Error("Jev returned an unexpected answer type");
    console.log(
      `classified "${message.text.slice(0, 60)}" by ${message.author}: ${answer.choice} (confidence ${answer.confidence})`,
    );
    // Records any delete/timeout/kick this implies. Dry-run by default, see moderation.ts.
    await ctx.runMutation(internal.moderation.applyPolicy, {
      messageId,
      category: answer.choice,
      confidence: answer.confidence,
    });
    // Long help requests in the /forwardfrom channel get their own support-forum post (guards live in followup.ts).
    if (
      answer.choice === "needs_help" &&
      (answer.confidence ?? 0) >= THRESHOLD_DEFAULTS.needs_help
    ) {
      await ctx.scheduler.runAfter(0, internal.followup_node.forwardToSupport, {
        messageId,
      });
    }
    return {
      category: answer.choice,
      confidence: answer.confidence,
      probabilities: answer.probabilities,
    };
  },
});
