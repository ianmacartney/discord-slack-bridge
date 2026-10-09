// Tags a post in the support forum with two independent Jev decisions: what KIND of post it is, and which AREA it's
// about. The forum is the one a moderator chose with the bot's /tags command. It runs once, when a post is created.
// Jev only picks among the tags set up with /tags add (plus the built-in ones in tagDefinitions.ts), and each
// pick maps to a tag that must already exist in the forum (matched by name, ignoring case, emoji and punctuation).
// Anything unsure or unmatched is left untagged. Every decision is logged in `tagDecisions`.
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
import { decide } from "./decisions";
import { THRESHOLD_DEFAULTS } from "./violations";
import { TagDecisions } from "./schema";
import { normalize, type Definition } from "./tagDefinitions";

const MAX_CONTEXT_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 2000;
// Jev's confidence says how concentrated its answer is. Below the "tag" threshold, a question adds no tag.

const criteria = (definitions: Record<string, Definition>) =>
  Object.fromEntries(
    Object.entries(definitions).map(([key, d]) => [key, d.when]),
  );

const threadForTagging = v.object({
  discordThreadId: v.string(),
  guildId: v.union(v.string(), v.null()),
  forumId: v.union(v.string(), v.null()),
  // The forum this server chose for auto-tagging with /tags, or null if none.
  tagForumId: v.union(v.string(), v.null()),
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
  // Retag: skip the "post has no tags yet" guard. The configured-forum guard still applies.
  force: boolean;
  triggeredBy?: string;
};

/**
 * Asks Jev for the post's type and area and, unless `preview`, applies the matching forum tags, logs the decision, and
 * posts a note for moderators. Returns null unless this is a post in the forum the server chose with /tags (preview
 * ignores that) that is untagged (a retag ignores that).
 */
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
    const alreadyTagged = !run.force && thread.appliedTagIds.length > 0;
    if (!isSupportPost || alreadyTagged || thread.messages.length === 0)
      return null;
  }

  const MIN_TAG_CONFIDENCE = THRESHOLD_DEFAULTS.tag;
  // The built-in definitions plus whatever moderators changed with /tags rule.
  const { type: POST_TYPES, area: POST_AREAS } = await ctx.runQuery(
    internal.tagRules.forGuild,
    { guildId: thread.guildId },
  );
  const { answers } = await decide(
    { post: { title: thread.title, messages: thread.messages } },
    {
      type: {
        type: "choice",
        instructions: "What kind of forum post is this?",
        criteria: criteria(POST_TYPES),
      },
      area: {
        type: "choice",
        instructions: "Which area of Convex is this post mainly about?",
        criteria: criteria(POST_AREAS),
      },
    },
  );

  const decisions: Infer<typeof tagReport>["decisions"] = [];
  const tagIds: string[] = [];
  const postType = answers.type;
  const notSupportPost =
    postType.type === "choice" &&
    postType.choice === "none" &&
    (postType.confidence ?? 0) >= MIN_TAG_CONFIDENCE;
  for (const [question, definitions] of [
    ["type", POST_TYPES],
    ["area", POST_AREAS],
  ] as const) {
    const answer = answers[question];
    if (answer.type !== "choice") continue;
    const confidence = answer.confidence ?? 0;
    const definition = definitions[answer.choice];
    let tag: string | null = null;
    let note: string | null = null;
    if (question === "area" && notSupportPost) {
      // Jev must pick an area even for chatter, so an area only counts for real support posts.
      note = "not a support post";
    } else if (!definition?.tag) {
      note = "no tag for this choice";
    } else if (confidence < MIN_TAG_CONFIDENCE) {
      note = `confidence ${confidence} is below ${MIN_TAG_CONFIDENCE}`;
    } else {
      const forumTag = thread.forumTags.find(
        (t) => normalize(t.name) === normalize(definition.tag!),
      );
      if (forumTag) {
        tag = forumTag.name;
        tagIds.push(forumTag.id);
      } else {
        note = `the forum has no tag named "${definition.tag}"`;
      }
    }
    decisions.push({ question, choice: answer.choice, confidence, tag, note });
  }

  console.log(
    `tags for "${thread.title.slice(0, 60)}": ${JSON.stringify(decisions)}`,
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
      force: false,
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
      trigger: "creation",
      force: false,
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
