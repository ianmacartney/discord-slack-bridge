// Jev-backed message classifier. classifyMessage runs on every new message (see receiveMessage in discord.ts).
// It can also be called by hand, for example:
//   npx convex run classify:classifyMessage '{"messageId": "..."}'
import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { decide } from "./decisions";
import { CLASSIFIED_VIOLATIONS, THRESHOLD_DEFAULTS } from "./violations";

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
  fraud_or_illegal:
    "Asking for help with a scam, fraud, theft or other crime, or recruiting others into one.",
  ragebait:
    "Written to provoke anger or arguments rather than to discuss, such as inflammatory or trolling remarks.",
  harassment: "Insults, threats, or targeted abuse aimed at a person or group.",
  off_topic: "Harmless but unrelated to the server's purpose.",
};

const BAN_QUESTION = {
  type: "noul",
  instructions:
    "Is this account clearly here only to spam, scam, or abuse people, with nothing worth keeping? " +
    "Crypto or giveaway scams, phishing links, mass-posted ads, recruiting for fraud and raw abuse are yes. " +
    "A real person being rude, off-topic or asking for work is no.",
} as const;

const REMOVAL_CATEGORIES = Object.fromEntries(
  [...CLASSIFIED_VIOLATIONS, "harassment"].map((c) => [
    c,
    MESSAGE_CATEGORIES[c as keyof typeof MESSAGE_CATEGORIES],
  ]),
);

export const reasonFor = (category: string, confidence: number | undefined) =>
  `${category.replace(/_/g, " ")} (Jev, ${Math.round((confidence ?? 0) * 100)}%)`;

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

export const suggestReason = internalAction({
  args: { discordMessageId: v.string() },
  returns: v.string(),
  handler: async (ctx, { discordMessageId }): Promise<string> => {
    const message: Infer<typeof messageForClassification> | null =
      await ctx.runQuery(internal.classify.getMessageByDiscordId, {
        discordMessageId,
      });
    if (!message) return "Removed by a moderator";
    const { answers } = await decide(
      { message: message.text, author: message.author },
      {
        category: {
          type: "choice",
          instructions: "Why would a moderator remove this Discord message?",
          criteria: REMOVAL_CATEGORIES,
        },
      },
    );
    const answer = answers.category;
    if (answer.type !== "choice") return "Removed by a moderator";
    return reasonFor(answer.choice, answer.confidence);
  },
});

export const getMessageByDiscordId = internalQuery({
  args: { discordMessageId: v.string() },
  returns: v.union(v.null(), messageForClassification),
  handler: async ({ db }, { discordMessageId }) => {
    const message = await db
      .query("messages")
      .withIndex("id", (q) => q.eq("id", discordMessageId))
      .unique();
    if (!message || !message.cleanContent.trim()) return null;
    const author = await db.get("users", message.authorId);
    return {
      text: message.cleanContent.slice(0, MAX_MESSAGE_CHARS),
      author: author?.displayName ?? author?.username ?? "unknown",
    };
  },
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
        ban: BAN_QUESTION,
      },
    );

    const answer = answers.category;
    if (answer.type !== "choice")
      throw new Error("Jev returned an unexpected answer type");
    const banScore = answers.ban.type === "noul" ? answers.ban.noul : 0;
    console.log(
      `classified "${message.text.slice(0, 60)}" by ${message.author}: ${answer.choice} (confidence ${answer.confidence}, ban ${banScore})`,
    );
    await ctx.runMutation(internal.moderation.applyPolicy, {
      messageId,
      category: answer.choice,
      confidence: answer.confidence,
      banScore,
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
