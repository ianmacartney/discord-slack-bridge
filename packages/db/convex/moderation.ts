// Moderation policy: turns a message classification into delete/timeout/kick/ban actions.
// Safe by default: dry-run is on, and kick/ban are never automatic, they always need a human approval.
// The Discord side (executing, posting proposals) lives in moderation_node.ts.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import {
  env,
  internalMutation,
  internalQuery,
  MutationCtx,
} from "./_generated/server";
import { apiMutation } from "./apiFunctions";
import { ModAlerts, moderationActionKind } from "./schema";
import {
  CLASSIFIED_VIOLATIONS,
  MOD_TIMEOUT_MINUTES,
  ThresholdName,
  VIOLATION_TIMEOUT_MINUTES,
  VIOLATION_TITLES,
} from "./violations";
import { loadThresholds } from "./thresholds";

// Confidence thresholds are in violations.ts (THRESHOLD_DEFAULTS) and can be changed with /confidence.
const PROPOSED_TIMEOUT_MINUTES = 60;
const KICK_WINDOW_MS = 24 * 60 * 60 * 1000;
const KICK_PROPOSAL_COUNT = 5;
// A person who just triggered a card gets later messages deleted, but no second timeout and no second card.
const ALERT_DEDUPE_MS = 10 * 60 * 1000;

/** Dry-run unless MODERATION_DRY_RUN is exactly "false". */
export const isDryRun = () => env.MODERATION_DRY_RUN !== "false";

export const get = internalQuery({
  args: { actionId: v.id("moderationActions") },
  handler: async (
    { db },
    { actionId },
  ): Promise<Doc<"moderationActions"> | null> => {
    return await db.get("moderationActions", actionId);
  },
});

export const setResult = internalMutation({
  args: {
    actionId: v.id("moderationActions"),
    status: v.union(
      v.literal("rejected"),
      v.literal("executed"),
      v.literal("dry_run"),
      v.literal("skipped"),
      v.literal("failed"),
    ),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async ({ db }, { actionId, status, note }) => {
    await db.patch("moderationActions", actionId, { status, note });
    return null;
  },
});

export const setProposalMessage = internalMutation({
  args: { actionId: v.id("moderationActions"), proposalMessageId: v.string() },
  returns: v.null(),
  handler: async ({ db }, { actionId, proposalMessageId }) => {
    await db.patch("moderationActions", actionId, { proposalMessageId });
    return null;
  },
});

type NewAction = Omit<
  Doc<"moderationActions">,
  "_id" | "_creationTime" | "status" | "dryRun"
>;

/** Records an action and schedules it: automatic ones execute, the rest are posted for approval. */
async function record(ctx: MutationCtx, action: NewAction) {
  const actionId = await ctx.db.insert("moderationActions", {
    ...action,
    status: "proposed",
    dryRun: isDryRun(),
  });
  if (action.auto) {
    await ctx.scheduler.runAfter(0, internal.moderation_node.execute, {
      actionId,
    });
  } else {
    await ctx.scheduler.runAfter(0, internal.moderation_node.postProposal, {
      actionId,
    });
  }
  return actionId;
}

async function countRecent(
  ctx: MutationCtx,
  targetDiscordUserId: string,
  action: NewAction["action"],
  windowMs: number,
) {
  const since = Date.now() - windowMs;
  const recent = await ctx.db
    .query("moderationActions")
    .withIndex("by_targetDiscordUserId_and_action", (q) =>
      q
        .eq("targetDiscordUserId", targetDiscordUserId)
        .eq("action", action)
        .gt("_creationTime", since),
    )
    .take(KICK_PROPOSAL_COUNT + 1);
  return recent.length;
}

/**
 * Deletes the message, times the person out for a day, and (once the timeout has run) posts a card in the mod channel
 * with Ban / Kick / Timeout / Warn buttons. Dry-run mode and the safety checks in moderation_node.ts apply to every
 * step, so staff and the server owner are never touched.
 */
async function handleViolation(
  ctx: MutationCtx,
  messageId: Doc<"messages">["_id"],
  kind: string,
  confidence: number | undefined,
  reason: string,
) {
  const message = await ctx.db.get("messages", messageId);
  if (!message) return;
  const [author, channel, thread] = await Promise.all([
    ctx.db.get("users", message.authorId),
    ctx.db.get("channels", message.channelId),
    message.threadId ? ctx.db.get("threads", message.threadId) : null,
  ]);
  if (!author || !channel || author.bot) return;

  const recent = await ctx.db
    .query("modAlerts")
    .withIndex("by_targetDiscordUserId", (q) =>
      q
        .eq("targetDiscordUserId", author.id)
        .gt("_creationTime", Date.now() - ALERT_DEDUPE_MS),
    )
    .first();
  const channelId = thread?.id ?? channel.id;
  const alertId =
    recent?._id ??
    (await ctx.db.insert("modAlerts", {
      kind,
      targetDiscordUserId: author.id,
      channelId,
      discordMessageId: message.id,
      content: message.cleanContent.slice(0, 1000),
      confidence,
      reason,
      status: "open",
    }));
  const base = {
    auto: true,
    category: kind,
    confidence,
    targetDiscordUserId: author.id,
    channelId,
    discordMessageId: message.id,
    alertId,
  };
  await record(ctx, { ...base, action: "delete", reason });
  if (recent) return;
  const timeoutId = await record(ctx, {
    ...base,
    action: "timeout",
    durationMinutes: VIOLATION_TIMEOUT_MINUTES,
    reason,
  });
  await ctx.db.patch("modAlerts", alertId, { timeoutActionId: timeoutId });
}

/**
 * Called after a message is classified.
 *  - A rule violation above its threshold (violations.ts): handled by handleViolation above.
 *  - harassment above the threshold: auto-delete the message and propose a 1-hour timeout for approval.
 *  - 5 flagged messages in 24 hours: propose a kick for approval.
 * Bans are never proposed here; moderators choose them on a card, or with `moderation:propose`.
 */
export const applyPolicy = internalMutation({
  args: {
    messageId: v.id("messages"),
    category: v.string(),
    confidence: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { messageId, category, confidence = 0 }) => {
    const min = await loadThresholds(ctx.db);
    if (
      (CLASSIFIED_VIOLATIONS as readonly string[]).includes(category) &&
      confidence >= min[category as ThresholdName]
    ) {
      await handleViolation(
        ctx,
        messageId,
        category,
        confidence,
        `Classified as ${category} (confidence ${confidence.toFixed(2)})`,
      );
      return null;
    }
    if (!(category === "harassment" && confidence >= min.harassment))
      return null;

    const message = await ctx.db.get("messages", messageId);
    if (!message) return null;
    const [author, channel, thread] = await Promise.all([
      ctx.db.get("users", message.authorId),
      ctx.db.get("channels", message.channelId),
      message.threadId ? ctx.db.get("threads", message.threadId) : null,
    ]);
    if (!author || !channel) return null;

    const base = {
      auto: true,
      category,
      confidence,
      targetDiscordUserId: author.id,
      channelId: thread?.id ?? channel.id,
      discordMessageId: message.id,
    };
    const reason = `Classified as ${category} (confidence ${confidence.toFixed(2)})`;

    // Count before recording so this message isn't included.
    const flaggedToday = await countRecent(
      ctx,
      author.id,
      "delete",
      KICK_WINDOW_MS,
    );
    await record(ctx, { ...base, action: "delete", reason });
    await record(ctx, {
      ...base,
      auto: false,
      action: "timeout",
      durationMinutes: PROPOSED_TIMEOUT_MINUTES,
      reason,
    });
    if (flaggedToday + 1 >= KICK_PROPOSAL_COUNT) {
      await record(ctx, {
        ...base,
        auto: false,
        action: "kick",
        reason: `${reason}; repeated offences in 24 hours`,
      });
    }
    return null;
  },
});

/** Called when a message uses @everyone or @here (rule 5). No AI: the text is checked exactly. */
export const alertMassMention = internalMutation({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    await handleViolation(
      ctx,
      messageId,
      "mass_mention",
      undefined,
      "Used @everyone or @here",
    );
    return null;
  },
});

const FLOOD_TIMEOUT_MINUTES = 60;

/**
 * Called when someone goes over the per-person message speed limit (limits.ts): time them out for an hour. It goes
 * through the same path as every other action, so dry-run mode and all the safety checks in moderation_node.ts apply
 * (never the owner, admins, moderators, bots, exempt users, or anyone ranked at or above the bot). At most one flood
 * timeout per person per hour.
 */
export const timeoutForFlooding = internalMutation({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get("messages", messageId);
    if (!message) return null;
    const [author, channel, thread] = await Promise.all([
      ctx.db.get("users", message.authorId),
      ctx.db.get("channels", message.channelId),
      message.threadId ? ctx.db.get("threads", message.threadId) : null,
    ]);
    if (!author || !channel || author.bot) return null;
    const recent = await countRecent(
      ctx,
      author.id,
      "timeout",
      FLOOD_TIMEOUT_MINUTES * 60 * 1000,
    );
    if (recent > 0) return null;
    await record(ctx, {
      auto: true,
      action: "timeout",
      durationMinutes: FLOOD_TIMEOUT_MINUTES,
      reason: "Posting messages too fast",
      category: "flood",
      targetDiscordUserId: author.id,
      channelId: thread?.id ?? channel.id,
      discordMessageId: message.id,
    });
    return null;
  },
});

/** Manually propose any action (including ban) for a human to approve in the mod channel. */
export const propose = internalMutation({
  args: {
    action: moderationActionKind,
    targetDiscordUserId: v.string(),
    channelId: v.string(),
    reason: v.string(),
    discordMessageId: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
  },
  returns: v.id("moderationActions"),
  handler: async (ctx, args) => await record(ctx, { ...args, auto: false }),
});

/** Called by the Discord bot when a moderator clicks Approve / Reject. The bot checks their permissions first. */
export const decide = apiMutation({
  args: {
    actionId: v.id("moderationActions"),
    approve: v.boolean(),
    decidedBy: v.string(),
  },
  handler: async (ctx, { actionId, approve, decidedBy }) => {
    const action = await ctx.db.get("moderationActions", actionId);
    if (!action || action.status !== "proposed" || action.auto)
      return { ok: false, status: action?.status };
    if (!approve) {
      await ctx.db.patch("moderationActions", actionId, {
        status: "rejected",
        decidedBy,
      });
      return { ok: true, status: "rejected" as const };
    }
    await ctx.db.patch("moderationActions", actionId, {
      status: "approved",
      decidedBy,
    });
    await ctx.scheduler.runAfter(0, internal.moderation_node.execute, {
      actionId,
    });
    return { ok: true, status: "approved" as const };
  },
});

export const getAlert = internalQuery({
  args: { alertId: v.id("modAlerts") },
  returns: v.union(v.null(), ModAlerts.doc),
  handler: async ({ db }, { alertId }) => await db.get("modAlerts", alertId),
});

export const setAlertNote = internalMutation({
  args: { alertId: v.id("modAlerts"), noteMessageId: v.string() },
  returns: v.null(),
  handler: async ({ db }, { alertId, noteMessageId }) => {
    await db.patch("modAlerts", alertId, { noteMessageId });
    return null;
  },
});

/** Records an action a moderator already chose (no proposal step) and runs it. */
async function approveAndRun(
  ctx: MutationCtx,
  alert: Doc<"modAlerts">,
  decidedBy: string,
  action: NewAction["action"],
  reason: string,
  durationMinutes?: number,
) {
  const actionId = await ctx.db.insert("moderationActions", {
    action,
    auto: false,
    status: "approved",
    dryRun: isDryRun(),
    reason,
    category: alert.kind,
    targetDiscordUserId: alert.targetDiscordUserId,
    channelId: alert.channelId,
    discordMessageId: alert.discordMessageId,
    durationMinutes,
    decidedBy,
    alertId: alert._id,
  });
  await ctx.scheduler.runAfter(0, internal.moderation_node.execute, {
    actionId,
  });
}

/**
 * Called by the Discord bot when a moderator presses a button on a mod-channel card. The bot checks their Discord
 * permissions first. Ban, kick, timeout and warn run right away (still subject to dry-run and the safety checks);
 * Dismiss lifts the automatic timeout.
 */
export const decideAlert = apiMutation({
  args: {
    alertId: v.id("modAlerts"),
    choice: v.union(
      v.literal("ban"),
      v.literal("kick"),
      v.literal("timeout"),
      v.literal("warn"),
      v.literal("dismiss"),
    ),
    decidedBy: v.string(),
  },
  returns: v.object({
    ok: v.boolean(),
    status: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
  }),
  handler: async (ctx, { alertId, choice, decidedBy }) => {
    const alert = await ctx.db.get("modAlerts", alertId);
    if (!alert || alert.status !== "open") {
      return { ok: false, status: alert?.status };
    }
    const title = VIOLATION_TITLES[alert.kind] ?? alert.kind;
    const reason = `Chosen by a moderator on a "${title}" card`;
    if (choice === "dismiss") {
      const timeout = alert.timeoutActionId
        ? await ctx.db.get("moderationActions", alert.timeoutActionId)
        : null;
      // Only a timeout that really ran needs lifting. In dry-run mode nothing was done.
      if (timeout?.status === "executed") {
        await approveAndRun(
          ctx,
          alert,
          decidedBy,
          "untimeout",
          `Dismissed by a moderator: "${title}" was a mistake`,
        );
      }
    } else if (choice === "timeout") {
      await approveAndRun(
        ctx,
        alert,
        decidedBy,
        "timeout",
        reason,
        MOD_TIMEOUT_MINUTES,
      );
    } else {
      await approveAndRun(ctx, alert, decidedBy, choice, reason);
    }
    await ctx.db.patch("modAlerts", alertId, {
      status: "handled",
      handledBy: decidedBy,
      handledAction: choice,
    });
    return { ok: true, status: "handled", dryRun: isDryRun() };
  },
});
