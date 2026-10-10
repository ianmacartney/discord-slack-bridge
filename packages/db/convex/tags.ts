import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  ActionCtx,
  env,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { apiMutation, apiQuery } from "./apiFunctions";
import { decide, JevQuestion } from "./decisions";
import { THRESHOLD_DEFAULTS } from "./violations";
import { TagDecisions } from "./schema";
import {
  DEFAULT_WHEN,
  isTopicTag,
  MAX_APPLIED_TAGS,
  normalize,
} from "./tagDefinitions";

const MAX_CONTEXT_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 2000;

export type ForumTag = { id: string; name: string };
export type TagChoice = {
  question: string;
  choice: string;
  confidence: number;
  tag: string | null;
  note: string | null;
};

export async function chooseTags(
  ctx: ActionCtx,
  guildId: string | null,
  post: { title: string; messages: string[] },
  forumTags: ForumTag[],
): Promise<{ tagIds: string[]; decisions: TagChoice[] }> {
  const rules: Record<string, { tag: string; when: string }> =
    await ctx.runQuery(internal.tagRules.forGuild, { guildId });
  const candidates = forumTags.filter(isTopicTag);
  if (candidates.length === 0) return { tagIds: [], decisions: [] };
  const questions: Record<string, JevQuestion> = {};
  for (const t of candidates) {
    const key = normalize(t.name);
    const when = rules[key]?.when ?? DEFAULT_WHEN[key] ?? t.name;
    questions[t.id] = {
      type: "noul",
      instructions: `Does the forum tag "${t.name}" apply to this post? It applies when: ${when}`,
    };
  }
  const { answers } = await decide({ post }, questions);
  const min = THRESHOLD_DEFAULTS.tag;
  const decisions: TagChoice[] = candidates.map((t) => {
    const answer = answers[t.id];
    const p = answer?.type === "noul" ? answer.noul : 0;
    const applies = p >= min;
    return {
      question: t.name,
      choice: applies ? "yes" : "no",
      confidence: p,
      tag: applies ? t.name : null,
      note: applies ? null : `probability ${p.toFixed(2)} is below ${min}`,
    };
  });
  const tagIds = decisions
    .filter((d) => d.tag)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_APPLIED_TAGS)
    .map((d) => candidates.find((t) => t.name === d.question)!.id);
  for (const d of decisions) {
    if (
      d.tag &&
      !tagIds.includes(candidates.find((t) => t.name === d.question)!.id)
    ) {
      d.tag = null;
      d.note = `more than ${MAX_APPLIED_TAGS} tags fit; dropped the least likely`;
    }
  }
  console.log(
    `tags for "${post.title.slice(0, 60)}": ${JSON.stringify(decisions)}`,
  );
  return { tagIds, decisions };
}

const threadForTagging = v.object({
  discordThreadId: v.string(),
  guildId: v.union(v.string(), v.null()),
  forumId: v.union(v.string(), v.null()),
  // The forum this server chose for auto-tagging with /tags, or null if none.
  tagForumId: v.union(v.string(), v.null()),
  forwarded: v.boolean(),
  // Who created the post, for the card.
  ownerId: v.union(v.string(), v.null()),
  ownerName: v.union(v.string(), v.null()),
  ownerAvatarUrl: v.union(v.string(), v.null()),
  title: v.string(),
  messages: v.array(v.string()),
  appliedTagIds: v.array(v.string()),
  forumTags: v.array(v.object({ id: v.string(), name: v.string() })),
  // The bot's latest successful decision for this post, so a retag only replaces the bot's own tags.
  previous: v.union(
    v.null(),
    v.object({
      decisionId: v.id("tagDecisions"),
      appliedTagIds: v.array(v.string()),
    }),
  ),
});

export const getThreadForTagging = internalQuery({
  args: { threadId: v.id("threads") },
  returns: v.union(v.null(), threadForTagging),
  handler: async ({ db }, { threadId }) => {
    const thread = await db.get("threads", threadId);
    if (!thread) return null;
    const channel = await db.get("channels", thread.channelId);
    const settings = thread.guildId
      ? await db
          .query("guildSettings")
          .withIndex("by_guildId", (q) => q.eq("guildId", thread.guildId!))
          .unique()
      : null;
    const owner = thread.ownerId
      ? await db
          .query("users")
          .withIndex("id", (q) => q.eq("id", thread.ownerId!))
          .unique()
      : null;
    const messages = await db
      .query("messages")
      .withIndex("threadId", (q) => q.eq("threadId", threadId))
      .take(MAX_CONTEXT_MESSAGES);
    const recent = await db
      .query("tagDecisions")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .order("desc")
      .take(5);
    const previous = recent.find((d) => d.status === "applied");
    return {
      discordThreadId: thread.id,
      guildId: thread.guildId ?? null,
      forumId: thread.parentId,
      tagForumId: settings?.tagForumId ?? null,
      forwarded: owner?.bot ?? false,
      ownerId: thread.ownerId,
      ownerName: owner?.displayName ?? owner?.username ?? null,
      ownerAvatarUrl: owner?.displayAvatarURL ?? owner?.avatarURL ?? null,
      title: thread.name,
      messages: messages
        .map((m) => m.cleanContent.slice(0, MAX_MESSAGE_CHARS))
        .filter(Boolean),
      appliedTagIds: thread.appliedTags,
      forumTags: (channel?.availableTags ?? []).map((t) => ({
        id: t.id,
        name: t.name,
      })),
      previous: previous
        ? { decisionId: previous._id, appliedTagIds: previous.appliedTagIds }
        : null,
    };
  },
});

const decision = v.object({
  question: v.string(),
  choice: v.string(),
  confidence: v.number(),
  // The forum tag this resolved to, or null when nothing is applied (see `note`).
  tag: v.union(v.string(), v.null()),
  note: v.union(v.string(), v.null()),
});
const tagReport = v.object({
  applied: v.array(v.string()),
  decisions: v.array(decision),
});

export const recordDecision = internalMutation({
  args: {
    threadId: v.id("threads"),
    discordThreadId: v.string(),
    guildId: v.union(v.string(), v.null()),
    trigger: v.union(v.literal("creation"), v.literal("retag")),
    triggeredBy: v.optional(v.string()),
    decisions: v.array(decision),
    appliedTagIds: v.array(v.string()),
    // The earlier decision this one replaces (a retag).
    supersedes: v.optional(v.id("tagDecisions")),
  },
  returns: v.id("tagDecisions"),
  handler: async ({ db }, { supersedes, guildId, appliedTagIds, ...rest }) => {
    if (supersedes) {
      await db.patch("tagDecisions", supersedes, { status: "superseded" });
    }
    return await db.insert("tagDecisions", {
      ...rest,
      guildId: guildId ?? undefined,
      appliedTagIds,
      status: appliedTagIds.length > 0 ? "applied" : "nothing",
    });
  },
});

export const getDecision = internalQuery({
  args: { decisionId: v.id("tagDecisions") },
  returns: v.union(v.null(), TagDecisions.doc),
  handler: async ({ db }, { decisionId }) =>
    await db.get("tagDecisions", decisionId),
});

export const setNoteMessage = internalMutation({
  args: { decisionId: v.id("tagDecisions"), noteMessageId: v.string() },
  returns: v.null(),
  handler: async ({ db }, { decisionId, noteMessageId }) => {
    await db.patch("tagDecisions", decisionId, { noteMessageId });
    return null;
  },
});

type TagRun = {
  preview: boolean;
  trigger: "creation" | "retag";
  triggeredBy?: string;
};

async function tagThread(
  ctx: ActionCtx,
  threadId: Id<"threads">,
  run: TagRun,
): Promise<Infer<typeof tagReport> | null> {
  const thread: Infer<typeof threadForTagging> | null = await ctx.runQuery(
    internal.tags.getThreadForTagging,
    { threadId },
  );
  if (!thread) return null;
  if (!run.preview) {
    const isSupportPost =
      thread.tagForumId !== null && thread.forumId === thread.tagForumId;
    const forwardedAtCreation = thread.forwarded && run.trigger === "creation";
    if (!isSupportPost || forwardedAtCreation || thread.messages.length === 0)
      return null;
  }

  const { tagIds, decisions } = await chooseTags(
    ctx,
    thread.guildId,
    { title: thread.title, messages: thread.messages },
    thread.forumTags,
  );

  if (!run.preview) {
    // A retag replaces only the tags the bot set before, never ones a human added.
    const previousIds = thread.previous?.appliedTagIds ?? [];
    const removeTagIds = previousIds.filter(
      (id) => !tagIds.includes(id) && thread.appliedTagIds.includes(id),
    );
    const decisionId = await ctx.runMutation(internal.tags.recordDecision, {
      threadId,
      discordThreadId: thread.discordThreadId,
      guildId: thread.guildId,
      trigger: run.trigger,
      triggeredBy: run.triggeredBy,
      decisions,
      appliedTagIds: tagIds,
      supersedes: thread.previous?.decisionId,
    });
    if (tagIds.length > 0 || removeTagIds.length > 0) {
      await ctx.scheduler.runAfter(0, internal.tags_node.applyThreadTags, {
        discordThreadId: thread.discordThreadId,
        addTagIds: tagIds,
        removeTagIds,
        reason: `Auto-tagged by Jev (${run.trigger})`,
      });
    }
    if (tagIds.length > 0) {
      await ctx.scheduler.runAfter(0, internal.tags_node.postTagNote, {
        decisionId,
      });
    }
  }
  return {
    applied: decisions.flatMap((d) => (d.tag ? [d.tag] : [])),
    decisions,
  };
}

/** Runs once, when a new post is created in the support forum (scheduled from receiveMessage; see discord.ts). */
export const tagNewPost = internalAction({
  args: { threadId: v.id("threads") },
  returns: v.null(),
  handler: async (ctx, { threadId }): Promise<null> => {
    await tagThread(ctx, threadId, {
      preview: false,
      trigger: "creation",
    });
    return null;
  },
});

/** By hand: `npx convex run tags:tagThreadNow '{"threadId": "...", "preview": true}'`. Preview applies nothing. */
export const tagThreadNow = internalAction({
  args: { threadId: v.id("threads"), preview: v.optional(v.boolean()) },
  returns: v.union(v.null(), tagReport),
  handler: async (
    ctx,
    { threadId, preview },
  ): Promise<Infer<typeof tagReport> | null> =>
    await tagThread(ctx, threadId, {
      preview: preview ?? false,
      trigger: "retag",
    }),
});

// The functions below are called by the Discord bot process (it passes CONVEX_API_TOKEN).

/** Bot: a moderator pressed Undo on a mod-channel note. Removes the tags the bot set for that decision. */
export const undoDecision = apiMutation({
  args: { decisionId: v.id("tagDecisions"), undoneBy: v.string() },
  returns: v.object({ ok: v.boolean(), status: v.optional(v.string()) }),
  handler: async (ctx, { decisionId, undoneBy }) => {
    const row = await ctx.db.get("tagDecisions", decisionId);
    if (!row || row.status !== "applied") {
      return { ok: false, status: row?.status };
    }
    await ctx.db.patch("tagDecisions", decisionId, {
      status: "undone",
      undoneBy,
    });
    await ctx.scheduler.runAfter(0, internal.tags_node.applyThreadTags, {
      discordThreadId: row.discordThreadId,
      addTagIds: [],
      removeTagIds: row.appliedTagIds,
      reason: "Auto-tag undone by a moderator",
    });
    return { ok: true, status: "undone" };
  },
});

/** Bot: the Edit button on a card. What the bot needs to open the tag picker for this decision. */
export const getDecisionForEdit = apiQuery({
  args: { decisionId: v.id("tagDecisions") },
  returns: v.union(
    v.null(),
    v.object({ discordThreadId: v.string(), status: v.string() }),
  ),
  handler: async ({ db }, { decisionId }) => {
    const row = await db.get("tagDecisions", decisionId);
    return row
      ? { discordThreadId: row.discordThreadId, status: row.status }
      : null;
  },
});

/** Bot: a moderator picked the tags by hand. The bot already set them on the post; this records the final choice. */
export const recordEdit = apiMutation({
  args: {
    decisionId: v.id("tagDecisions"),
    appliedTagIds: v.array(v.string()),
    editedBy: v.string(),
  },
  returns: v.null(),
  handler: async ({ db }, { decisionId, appliedTagIds, editedBy }) => {
    // Back to "applied" even if it was undone, so a later Undo removes exactly what the moderator chose.
    await db.patch("tagDecisions", decisionId, {
      appliedTagIds,
      editedBy,
      status: "applied",
    });
    return null;
  },
});

/** Bot: the mod channel that cards and notes go to, if any. */
export const tagStatus = apiQuery({
  args: { guildId: v.string() },
  returns: v.object({ modChannelId: v.union(v.string(), v.null()) }),
  handler: async ({ db }, { guildId }) => {
    const row = await db
      .query("guildSettings")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .unique();
    return { modChannelId: row?.modChannelId ?? env.MOD_CHANNEL_ID ?? null };
  },
});
