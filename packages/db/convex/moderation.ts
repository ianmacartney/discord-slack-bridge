import { Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import type { raidState } from "./classify";
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
  CROSS_POST_CHANNELS,
  isRaidBait,
  MOD_TIMEOUT_MINUTES,
  postFingerprint,
  RAID_WINDOW_MS,
  teamPingMinutes,
  teamPingTimesOut,
  THRESHOLD_DEFAULTS,
  ThresholdName,
  VIOLATION_TIMEOUT_MINUTES,
  VIOLATION_TITLES,
} from "./violations";
import { literals } from "convex-helpers/validators";

const PROPOSED_TIMEOUT_MINUTES = 60;
const KICK_WINDOW_MS = 24 * 60 * 60 * 1000;
const KICK_PROPOSAL_COUNT = 5;
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

async function allSettings(ctx: MutationCtx) {
  return await ctx.db.query("guildSettings").take(50);
}

async function handleViolation(
  ctx: MutationCtx,
  messageId: Doc<"messages">["_id"],
  kind: string,
  confidence: number | undefined,
  reason: string,
  punishment: "timeout" | "kick" | "ban" = "timeout",
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
  if (
    punishment !== "timeout" &&
    kind !== "raid" &&
    (await allSettings(ctx)).some((s) =>
      s.vipChannelIds?.some((id) => id === channel.id || id === thread?.id),
    )
  ) {
    reason += `; not ${punishment === "ban" ? "banned" : "kicked"} automatically in a VIP channel`;
    punishment = "timeout";
  }
  const harsherOrEqual: NewAction["action"][] =
    punishment === "timeout" ? ["ban", "kick", "timeout"] : ["ban", "kick"];
  for (const action of harsherOrEqual) {
    if (await countRecent(ctx, author.id, action, RAID_WINDOW_MS)) return;
  }
  if (punishment !== "timeout") {
    const base = {
      auto: true,
      category: kind,
      confidence,
      targetDiscordUserId: author.id,
      channelId,
      discordMessageId: message.id,
    };
    if (punishment === "kick") {
      await record(ctx, { ...base, action: "delete", reason });
    }
    await record(ctx, {
      ...base,
      action: punishment,
      ...(punishment === "ban" && { deleteMessageDays: BAN_DELETE_DAYS }),
      reason,
    });
    return;
  }

  const alertId = await ctx.db.insert("modAlerts", {
    kind,
    targetDiscordUserId: author.id,
    channelId,
    discordMessageId: message.id,
    content: message.cleanContent.slice(0, 1000),
    confidence,
    reason,
    status: "open",
  });
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
  const timeoutId = await record(ctx, {
    ...base,
    action: "timeout",
    durationMinutes: VIOLATION_TIMEOUT_MINUTES,
    reason,
  });
  await ctx.db.patch("modAlerts", alertId, { timeoutActionId: timeoutId });
}

async function remind(
  ctx: MutationCtx,
  messageId: Doc<"messages">["_id"],
  kind: "convex_self_promo",
  confidence: number,
) {
  const message = await ctx.db.get("messages", messageId);
  if (!message) return;
  const [author, channel, thread] = await Promise.all([
    ctx.db.get("users", message.authorId),
    ctx.db.get("channels", message.channelId),
    message.threadId ? ctx.db.get("threads", message.threadId) : null,
  ]);
  if (!author || !channel || author.bot) return;
  const base = {
    auto: true,
    category: kind,
    confidence,
    targetDiscordUserId: author.id,
    channelId: thread?.id ?? channel.id,
    discordMessageId: message.id,
  };
  const promo = (await allSettings(ctx)).find(
    (s) => s.selfPromoChannelId,
  )?.selfPromoChannelId;
  if (!promo || promo === channel.id || promo === thread?.id) return;
  await record(ctx, {
    ...base,
    action: "delete",
    reason: `Convex self-promotion outside the self-promo channel (Jev, ${Math.round(confidence * 100)}%)`,
  });
}

const RAID_HISTORY = 5;
const RAID_POSTS = 10;
const RAID_TEXT_CHARS = 500;

const placeOf = async (ctx: MutationCtx, m: Doc<"messages">) => {
  const [channel, thread] = await Promise.all([
    ctx.db.get("channels", m.channelId),
    m.threadId ? ctx.db.get("threads", m.threadId) : null,
  ]);
  return {
    id: thread?.id ?? channel?.id ?? "",
    name: thread?.name ?? channel?.name ?? "unknown",
  };
};

// Punishments that mean their messages are already known to be spam, scams or other violations.
const VIOLATION_KINDS = new Set<string>([
  ...CLASSIFIED_VIOLATIONS,
  "raid",
  "discord_invite",
  "dm_solicitation",
]);

const hasRecentViolation = async (
  ctx: MutationCtx,
  targetDiscordUserId: string,
) => {
  for (const action of ["ban", "timeout"] as const) {
    const recent = await ctx.db
      .query("moderationActions")
      .withIndex("by_targetDiscordUserId_and_action", (q) =>
        q
          .eq("targetDiscordUserId", targetDiscordUserId)
          .eq("action", action)
          .gt("_creationTime", Date.now() - RAID_WINDOW_MS),
      )
      .take(10);
    if (recent.some((a) => a.auto && VIOLATION_KINDS.has(a.category ?? ""))) {
      return true;
    }
  }
  return false;
};

/**
 * Runs on every message a person sends. Spots a spam raid (the same post in several channels, or going over the
 * message rate limit) and acts once per raid. Returns true when the message belongs to a raid, so it skips per-message
 * classification and punishment.
 */
export const checkRaid = async (
  ctx: MutationCtx,
  messageId: Id<"messages">,
  overRateLimit: boolean,
) => {
  const message = await ctx.db.get("messages", messageId);
  if (!message) return false;
  const author = await ctx.db.get("users", message.authorId);
  if (!author || author.bot) return false;
  const since = Date.now() - RAID_WINDOW_MS;
  const [newestFirst, raids] = await Promise.all([
    ctx.db
      .query("messages")
      .withIndex("by_authorId", (q) =>
        q.eq("authorId", message.authorId).gt("_creationTime", since),
      )
      .order("desc")
      .take(25),
    ctx.db
      .query("raids")
      .withIndex("by_authorId", (q) =>
        q.eq("authorId", message.authorId).gt("_creationTime", since),
      )
      .take(5),
  ]);
  const recent = newestFirst.reverse();
  const fingerprint = postFingerprint(message.content, message.attachments);

  const open = raids.find((r) => r.decision !== "ignored");
  if (open) {
    const [place, first] = await Promise.all([
      placeOf(ctx, message),
      ctx.db.get("messages", open.messageIds[0]),
    ]);
    await ctx.db.patch("raids", open._id, {
      messageIds: [...open.messageIds, messageId],
      channelIds: [...new Set([...open.channelIds, place.id])],
      spreadSeconds: Math.round(
        (message._creationTime - (first?._creationTime ?? open._creationTime)) /
          1000,
      ),
    });
    return true;
  }

  const alreadyCleared = (trigger: Doc<"raids">["trigger"]) =>
    raids.some(
      (r) =>
        r.trigger === trigger &&
        (trigger === "rate_limit" || r.fingerprint === fingerprint),
    );
  const copies = fingerprint
    ? recent.filter(
        (m) => postFingerprint(m.content, m.attachments) === fingerprint,
      )
    : [];
  const crossPost =
    new Set(copies.map((m) => m.threadId ?? m.channelId)).size >=
      CROSS_POST_CHANNELS && !alreadyCleared("cross_post");
  const rateLimited = overRateLimit && !alreadyCleared("rate_limit");
  if (!crossPost && !rateLimited) return false;

  const trigger = crossPost ? "cross_post" : "rate_limit";
  const posts = (crossPost ? copies : recent).slice(-RAID_POSTS);
  const first = posts[0];
  const spreadSeconds = Math.round(
    (message._creationTime - first._creationTime) / 1000,
  );
  const [earlier, places] = await Promise.all([
    ctx.db
      .query("messages")
      .withIndex("by_authorId", (q) =>
        q
          .eq("authorId", message.authorId)
          .lt("_creationTime", first._creationTime),
      )
      .order("desc")
      .take(RAID_HISTORY),
    Promise.all(posts.map((m) => placeOf(ctx, m))),
  ]);
  const channelIds = [...new Set(places.map((p) => p.id))];
  const bait = crossPost && isRaidBait(message.content, message.attachments);
  const flagged = !bait && (await hasRecentViolation(ctx, author.id));
  const fastPath = bait || flagged;
  const raidId = await ctx.db.insert("raids", {
    authorId: message.authorId,
    trigger,
    fingerprint: crossPost ? fingerprint! : undefined,
    channelIds,
    messageIds: posts.map((m) => m._id),
    spreadSeconds,
    fastPath,
    decision: fastPath ? "banned" : "pending",
  });
  const where = `${posts.length} messages in ${channelIds.length} channels over ${spreadSeconds}s`;

  if (fastPath) {
    await handleViolation(
      ctx,
      messageId,
      "raid",
      undefined,
      `Spam raid: ${bait ? "same image or link post" : "messages already classified as spam"}, ${where}`,
      "ban",
    );
    return true;
  }
  const state: Infer<typeof raidState> = {
    trigger,
    posts: posts.map((m, i) => ({
      channel: places[i].name,
      text: m.cleanContent.slice(0, RAID_TEXT_CHARS),
      attachments: (m.attachments ?? []).map((a) => a.name),
    })),
    identical: crossPost,
    spreadSeconds,
    firstMessage: earlier.length === 0,
    authorHistory: earlier
      .reverse()
      .map(
        (m) =>
          m.cleanContent.slice(0, RAID_TEXT_CHARS) ||
          `[${m.attachments?.length ?? 0} images]`,
      ),
    joinedServer: author.joinedTimestamp
      ? new Date(author.joinedTimestamp).toISOString()
      : null,
    accountCreated: new Date(author.createdTimestamp).toISOString(),
  };
  await ctx.scheduler.runAfter(0, internal.classify.judgeRaid, {
    raidId,
    messageId,
    state,
  });
  return true;
};

export const settleRaid = internalMutation({
  args: {
    raidId: v.id("raids"),
    messageId: v.id("messages"),
    spamScore: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { raidId, messageId, spamScore }) => {
    const raid = await ctx.db.get("raids", raidId);
    if (!raid || raid.decision !== "pending") return null;
    const author = await ctx.db.get("users", raid.authorId);
    const spam =
      spamScore >= THRESHOLD_DEFAULTS.raid ||
      (!!author && (await hasRecentViolation(ctx, author.id)));
    await ctx.db.patch("raids", raidId, {
      spamScore,
      decision: spam ? "banned" : "ignored",
    });
    if (spam) {
      await handleViolation(
        ctx,
        messageId,
        "raid",
        spamScore,
        `Spam raid (${raid.trigger === "cross_post" ? "same post in several channels" : "over the message rate limit"}): ` +
          `${raid.messageIds.length} messages in ${raid.channelIds.length} channels over ${raid.spreadSeconds}s; ` +
          `Jev ${Math.round(spamScore * 100)}% sure it's spam`,
        "ban",
      );
    }
    return null;
  },
});

export const punishSupportBreak = internalMutation({
  args: {
    messageId: v.id("messages"),
    dmScore: v.number(),
    punishment: literals("timeout", "kick", "ban"),
    confidence: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { messageId, dmScore, punishment, confidence }) => {
    const pct = (n = 0) => `${Math.round(n * 100)}%`;
    await handleViolation(
      ctx,
      messageId,
      "dm_solicitation",
      dmScore,
      `Sent people to support outside the Convex dashboard or community-support (Jev, ${pct(dmScore)}); ` +
        `Jev chose ${punishment} (${pct(confidence)})`,
      punishment,
    );
    return null;
  },
});

export const applyPolicy = internalMutation({
  args: {
    messageId: v.id("messages"),
    category: v.string(),
    confidence: v.optional(v.number()),
    banScore: v.optional(v.number()),
    dmScore: v.optional(v.number()),
    scamScore: v.optional(v.number()),
    teamPing: v.optional(
      v.object({
        aggressive: v.number(),
        rude: v.number(),
        goodReason: v.number(),
        timeout: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (
    ctx,
    {
      messageId,
      category,
      confidence = 0,
      banScore = 0,
      dmScore = 0,
      scamScore = 0,
      teamPing,
    },
  ) => {
    const min = THRESHOLD_DEFAULTS;
    // Jev often splits a scam between spam and fraud; together they count as spam.
    if (scamScore >= min.spam) {
      category = "spam";
      confidence = scamScore;
    }
    if (
      (CLASSIFIED_VIOLATIONS as readonly string[]).includes(category) &&
      confidence >= min[category as ThresholdName]
    ) {
      const message = await ctx.db.get("messages", messageId);
      const raid =
        message &&
        (await ctx.db
          .query("raids")
          .withIndex("by_authorId", (q) =>
            q
              .eq("authorId", message.authorId)
              .gt("_creationTime", Date.now() - RAID_WINDOW_MS),
          )
          .filter((q) => q.neq(q.field("decision"), "ignored"))
          .first());
      if (raid) {
        if (raid.decision !== "banned") {
          await ctx.db.patch("raids", raid._id, { decision: "banned" });
        }
        await handleViolation(
          ctx,
          messageId,
          "raid",
          confidence,
          `Classified as ${category} (confidence ${confidence.toFixed(2)}) during a spam raid`,
          "ban",
        );
        return null;
      }
      const scam = category === "spam" || category === "fraud_or_illegal";
      const fingerprint =
        scam && message
          ? postFingerprint(message.content, message.attachments)
          : null;
      const copies =
        message && fingerprint
          ? (
              await ctx.db
                .query("messages")
                .withIndex("by_authorId", (q) =>
                  q
                    .eq("authorId", message.authorId)
                    .gt("_creationTime", Date.now() - RAID_WINDOW_MS),
                )
                .order("desc")
                .take(25)
            ).filter(
              (m) => postFingerprint(m.content, m.attachments) === fingerprint,
            )
          : [];
      if (message && fingerprint && copies.length >= 2) {
        const places = await Promise.all(copies.map((m) => placeOf(ctx, m)));
        const spreadSeconds = Math.round(
          (copies[0]._creationTime - copies[copies.length - 1]._creationTime) /
            1000,
        );
        await ctx.db.insert("raids", {
          authorId: message.authorId,
          trigger: "repeat",
          fingerprint,
          channelIds: [...new Set(places.map((p) => p.id))],
          messageIds: copies.map((m) => m._id),
          spreadSeconds,
          spamScore: confidence,
          fastPath: true,
          decision: "banned",
        });
        await handleViolation(
          ctx,
          messageId,
          "raid",
          confidence,
          `Same ${category.replace(/_/g, " ")} message posted ${copies.length} times over ${spreadSeconds}s ` +
            `(confidence ${confidence.toFixed(2)})`,
          "ban",
        );
        return null;
      }
      const ban = category === "spam" || banScore >= min.ban;
      await handleViolation(
        ctx,
        messageId,
        category,
        confidence,
        `Classified as ${category} (confidence ${confidence.toFixed(2)})` +
          (category === "spam"
            ? "; spam is an immediate ban"
            : ban
              ? `; Jev is ${Math.round(banScore * 100)}% sure this account is only here for that`
              : ""),
        ban ? "ban" : "timeout",
      );
      return null;
    }
    if (dmScore >= min.dm_solicitation) {
      await ctx.scheduler.runAfter(0, internal.classify.judgeSupportBreak, {
        messageId,
        dmScore,
      });
      return null;
    }
    if (
      category === "convex_self_promo" &&
      confidence >= min.convex_self_promo
    ) {
      await remind(ctx, messageId, "convex_self_promo", confidence);
      return null;
    }
    const pingTimedOut =
      !!teamPing && teamPingTimesOut(teamPing, min.team_ping);
    if (pingTimedOut) await timeoutTeamPing(ctx, messageId, teamPing!);
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

    const flaggedToday = await countRecent(
      ctx,
      author.id,
      "delete",
      KICK_WINDOW_MS,
    );
    await record(ctx, { ...base, action: "delete", reason });
    if (!pingTimedOut) {
      await record(ctx, {
        ...base,
        auto: false,
        action: "timeout",
        durationMinutes: PROPOSED_TIMEOUT_MINUTES,
        reason,
      });
    }
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

export const banForInvite = internalMutation({
  args: { messageId: v.id("messages"), code: v.string() },
  returns: v.null(),
  handler: async (ctx, { messageId, code }) => {
    await handleViolation(
      ctx,
      messageId,
      "discord_invite",
      undefined,
      `Posted an invite to another Discord server (discord.gg/${code})`,
      "ban",
    );
    return null;
  },
});

async function timeoutTeamPing(
  ctx: MutationCtx,
  messageId: Doc<"messages">["_id"],
  scores: { aggressive: number; rude: number; timeout: number },
) {
  const message = await ctx.db.get("messages", messageId);
  if (!message) return;
  const [author, channel, thread] = await Promise.all([
    ctx.db.get("users", message.authorId),
    ctx.db.get("channels", message.channelId),
    message.threadId ? ctx.db.get("threads", message.threadId) : null,
  ]);
  if (!author || !channel || author.bot) return;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  await record(ctx, {
    auto: true,
    action: "timeout",
    category: "team_ping",
    confidence: scores.timeout,
    targetDiscordUserId: author.id,
    channelId: thread?.id ?? channel.id,
    discordMessageId: message.id,
    durationMinutes: teamPingMinutes(scores.aggressive, scores.rude),
    reason: `Pinged the Convex team without a good reason (Jev: timeout ${pct(scores.timeout)}, aggressive ${pct(scores.aggressive)}, rude ${pct(scores.rude)})`,
  });
}

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
