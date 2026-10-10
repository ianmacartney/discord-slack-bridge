// Moderation policy: turns a message classification into delete/timeout/kick/ban actions.
// The Discord side (executing, posting proposals) lives in moderation_node.ts.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  MutationCtx,
} from "./_generated/server";
import { apiMutation } from "./apiFunctions";
import { ModAlerts, moderationActionKind } from "./schema";
import {
  CLASSIFIED_VIOLATIONS,
  MOD_TIMEOUT_MINUTES,
  THRESHOLD_DEFAULTS,
  ThresholdName,
  VIOLATION_TIMEOUT_MINUTES,
  VIOLATION_TITLES,
} from "./violations";
import { literals } from "convex-helpers/validators";

const PROPOSED_TIMEOUT_MINUTES = 60;
const KICK_WINDOW_MS = 24 * 60 * 60 * 1000;
const KICK_PROPOSAL_COUNT = 5;
const ALERT_DEDUPE_MS = 10 * 60 * 1000;
export const BAN_DELETE_DAYS = 7;
const CHAT_TIMEOUT_MINUTES = VIOLATION_TIMEOUT_MINUTES;

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
    status: literals("rejected", "executed", "dry_run", "skipped", "failed"),
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

async function handleViolation(
  ctx: MutationCtx,
  messageId: Doc<"messages">["_id"],
  kind: string,
  confidence: number | undefined,
  reason: string,
  ban = false,
) {
  const message = await ctx.db.get("messages", messageId);
  if (!message) return;
  const [author, channel, thread] = await Promise.all([
    ctx.db.get("users", message.authorId),
    ctx.db.get("channels", message.channelId),
    message.threadId ? ctx.db.get("threads", message.threadId) : null,
  ]);
  if (!author || !channel || author.bot) return;
  const channelId = thread?.id ?? channel.id;
  if (ban) {
    const base = {
      auto: true,
      category: kind,
      confidence,
      targetDiscordUserId: author.id,
      channelId,
      discordMessageId: message.id,
    };
    await record(ctx, { ...base, action: "delete", reason });
    const alreadyBanned =
      (await countRecent(ctx, author.id, "ban", ALERT_DEDUPE_MS)) > 0;
    if (!alreadyBanned) {
      await record(ctx, {
        ...base,
        action: "ban",
        deleteMessageDays: BAN_DELETE_DAYS,
        reason,
      });
    }
    return;
  }

  const recent = await ctx.db
    .query("modAlerts")
    .withIndex("by_targetDiscordUserId", (q) =>
      q
        .eq("targetDiscordUserId", author.id)
        .gt("_creationTime", Date.now() - ALERT_DEDUPE_MS),
    )
    .first();
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
 *  - harassment above the threshold: auto-delete the message and propose a 1-hour timeout for approval.
 *  - 5 flagged messages in 24 hours: propose a kick for approval.
 */
export const applyPolicy = internalMutation({
  args: {
    messageId: v.id("messages"),
    category: v.string(),
    confidence: v.optional(v.number()),
    banScore: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (
    ctx,
    { messageId, category, confidence = 0, banScore = 0 },
  ) => {
    const min = THRESHOLD_DEFAULTS;
    if (
      (CLASSIFIED_VIOLATIONS as readonly string[]).includes(category) &&
      confidence >= min[category as ThresholdName]
    ) {
      const ban = banScore >= min.ban;
      await handleViolation(
        ctx,
        messageId,
        category,
        confidence,
        `Classified as ${category} (confidence ${confidence.toFixed(2)})` +
          (ban
            ? `; Jev is ${Math.round(banScore * 100)}% sure this account is only here for that`
            : ""),
        ban,
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
    reason,
    category: alert.kind,
    targetDiscordUserId: alert.targetDiscordUserId,
    channelId: alert.channelId,
    discordMessageId: alert.discordMessageId,
    durationMinutes,
    deleteMessageDays: action === "ban" ? BAN_DELETE_DAYS : undefined,
    decidedBy,
    alertId: alert._id,
  });
  await ctx.scheduler.runAfter(0, internal.moderation_node.execute, {
    actionId,
  });
}

export const decideAlert = apiMutation({
  args: {
    alertId: v.id("modAlerts"),
    choice: literals("ban", "kick", "timeout", "warn", "dismiss"),
    decidedBy: v.string(),
  },
  returns: v.object({ ok: v.boolean(), status: v.optional(v.string()) }),
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
    return { ok: true, status: "handled" };
  },
});

export const actFromChat = apiMutation({
  args: {
    action: literals("ban", "timeout", "kick"),
    targetDiscordUserId: v.string(),
    channelId: v.string(),
    discordMessageId: v.string(),
    reason: v.optional(v.string()),
    decidedBy: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { action, reason, ...target }) => {
    const base = {
      ...target,
      auto: false,
      status: "approved" as const,
      category: "chat_command",
      reason: reason ?? "",
    };
    const actionIds: Id<"moderationActions">[] = [];
    if (action !== "ban") {
      actionIds.push(
        await ctx.db.insert("moderationActions", { ...base, action: "delete" }),
      );
    }
    actionIds.push(
      await ctx.db.insert("moderationActions", {
        ...base,
        action,
        durationMinutes:
          action === "timeout" ? CHAT_TIMEOUT_MINUTES : undefined,
        deleteMessageDays: action === "ban" ? BAN_DELETE_DAYS : undefined,
      }),
    );
    await ctx.scheduler.runAfter(0, internal.moderation.runChatCommand, {
      actionIds,
    });
    return null;
  },
});

export const runChatCommand = internalAction({
  args: { actionIds: v.array(v.id("moderationActions")) },
  returns: v.null(),
  handler: async (ctx, { actionIds }): Promise<null> => {
    const first: Doc<"moderationActions"> | null = await ctx.runQuery(
      internal.moderation.get,
      { actionId: actionIds[0] },
    );
    if (!first) return null;
    let reason = first.reason;
    if (!reason) {
      reason = await ctx
        .runAction(internal.classify.suggestReason, {
          discordMessageId: first.discordMessageId!,
        })
        .catch((error) => {
          console.error("Jev couldn't suggest a reason", error);
          return "Removed by a moderator";
        });
    }
    for (const actionId of actionIds) {
      await ctx.runMutation(internal.moderation.setReason, {
        actionId,
        reason,
      });
      await ctx.runAction(internal.moderation_node.execute, { actionId });
    }
    return null;
  },
});

export const setReason = internalMutation({
  args: { actionId: v.id("moderationActions"), reason: v.string() },
  returns: v.null(),
  handler: async ({ db }, { actionId, reason }) => {
    await db.patch("moderationActions", actionId, { reason });
    return null;
  },
});
