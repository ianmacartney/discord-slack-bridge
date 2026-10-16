import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { internalAction, internalQuery } from "./_generated/server";
import { decide, JevAnswer } from "./decisions";
import { CLASSIFIED_VIOLATIONS, THRESHOLD_DEFAULTS } from "./violations";

const MAX_MESSAGE_CHARS = 4000;
// 20 x 1000 + 4000 stays under the ~32KB where Jev switches to its slower long-context mode.
const EARLIER_MESSAGES = 20;
const MAX_EARLIER_CHARS = 1000;
const ONLY_THE_MESSAGE =
  " Judge `message` only; `earlierMessages` and `replyTo` are the conversation before it.";

export const MESSAGE_CATEGORIES = {
  normal: "Ordinary conversation that needs no action.",
  needs_help:
    "Someone is asking for help or reporting a problem they want solved.",
  spam:
    "Unsolicited promotion, scams, repeated junk, bot-like repetition, self-promotion unrelated to Convex, " +
    "phishing or scam links, or links with no relevance to the conversation.",
  convex_self_promo:
    "Sharing something the author made with or about Convex, such as a project, template, component, post or video.",
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

const DM_QUESTION = {
  type: "noul",
  instructions:
    "Is this message telling someone to check their DMs, saying the author sent them a DM, " +
    "or asking people to DM the author?" +
    ONLY_THE_MESSAGE,
} as const;

// Only asked when the message tags the Convex team.
const TEAM_PING_QUESTIONS = {
  aggressive: {
    type: "noul",
    instructions: "Is this message aggressive?" + ONLY_THE_MESSAGE,
  },
  rude: {
    type: "noul",
    instructions: "Is this message rude?" + ONLY_THE_MESSAGE,
  },
  goodReason: {
    type: "noul",
    instructions:
      "This message tags Convex team members. Is that a good reason to tag them, " +
      "such as a reply in a conversation they are part of, an outage, or a security issue?" +
      ONLY_THE_MESSAGE,
  },
  timeout: {
    type: "noul",
    instructions:
      "This message tags Convex team members. Should the author be timed out for tagging them?" +
      ONLY_THE_MESSAGE,
  },
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

const earlierMessage = v.object({ author: v.string(), text: v.string() });

const messageWithContext = v.object({
  ...messageForClassification.fields,
  earlierMessages: v.array(earlierMessage),
  replyTo: v.optional(earlierMessage),
});

export const getMessageForClassification = internalQuery({
  args: { messageId: v.id("messages") },
  returns: v.union(v.null(), messageWithContext),
  handler: async ({ db }, { messageId }) => {
    const message = await db.get("messages", messageId);
    if (!message || !message.cleanContent.trim()) return null;
    const [thread, earlier, replied] = await Promise.all([
      message.threadId ? db.get("threads", message.threadId) : null,
      db
        .query("messages")
        .withIndex("channelId_threadId", (q) =>
          q
            .eq("channelId", message.channelId)
            .eq("threadId", message.threadId)
            .lt("_creationTime", message._creationTime),
        )
        .order("desc")
        .take(EARLIER_MESSAGES),
      message.reference?.messageId
        ? db
            .query("messages")
            .withIndex("id", (q) => q.eq("id", message.reference!.messageId!))
            .unique()
        : null,
    ]);
    const name = async (m: Doc<"messages">) => {
      const user = await db.get("users", m.authorId);
      return user?.displayName ?? user?.username ?? "unknown";
    };
    const brief = async (m: Doc<"messages">) => ({
      author: await name(m),
      text: m.cleanContent.slice(0, MAX_EARLIER_CHARS),
    });
    const kept = (m: Doc<"messages"> | null): m is Doc<"messages"> =>
      !!m && !m.deleted && !!m.cleanContent.trim();
    return {
      text: message.cleanContent.slice(0, MAX_MESSAGE_CHARS),
      author: await name(message),
      threadName: thread?.name,
      earlierMessages: await Promise.all(
        earlier.filter(kept).reverse().map(brief),
      ),
      replyTo: kept(replied) ? await brief(replied) : undefined,
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

export const classifyMessage = internalAction({
  args: { messageId: v.id("messages"), pingedTeam: v.optional(v.boolean()) },
  returns: v.union(v.null(), messageClassification),
  handler: async (
    ctx,
    { messageId, pingedTeam },
  ): Promise<Infer<typeof messageClassification> | null> => {
    const message: Infer<typeof messageWithContext> | null = await ctx.runQuery(
      internal.classify.getMessageForClassification,
      {
        messageId,
      },
    );

    if (!message) return null;

    const { answers } = await decide(
      {
        message: message.text,
        author: message.author,
        thread: message.threadName,
        earlierMessages: message.earlierMessages,
        replyTo: message.replyTo,
      },
      {
        category: {
          type: "choice",
          instructions:
            "Which category best describes this Discord message?" +
            ONLY_THE_MESSAGE,
          criteria: MESSAGE_CATEGORIES,
        },
        ban: BAN_QUESTION,
        dm: DM_QUESTION,
        ...(pingedTeam ? TEAM_PING_QUESTIONS : {}),
      },
    );

    const answer = answers.category;
    if (answer.type !== "choice")
      throw new Error("Jev returned an unexpected answer type");
    const banScore = answers.ban.type === "noul" ? answers.ban.noul : 0;
    const dmScore = answers.dm.type === "noul" ? answers.dm.noul : 0;
    const noul = (key: keyof typeof TEAM_PING_QUESTIONS) => {
      const a = (answers as Record<string, JevAnswer | undefined>)[key];
      return a?.type === "noul" ? a.noul : 0;
    };
    const teamPing = pingedTeam
      ? {
          aggressive: noul("aggressive"),
          rude: noul("rude"),
          goodReason: noul("goodReason"),
          timeout: noul("timeout"),
        }
      : undefined;
    console.log(
      `classified "${message.text.slice(0, 60)}" by ${message.author}: ${answer.choice} (confidence ${answer.confidence}, ban ${banScore}, dm ${dmScore}${teamPing ? `, team ping ${JSON.stringify(teamPing)}` : ""})`,
    );
    await ctx.runMutation(internal.moderation.applyPolicy, {
      messageId,
      category: answer.choice,
      confidence: answer.confidence,
      banScore,
      dmScore,
      teamPing,
    });
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
