import { WithoutSystemFields } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  DatabaseReader,
  DatabaseWriter,
  internalMutation,
  internalQuery,
  mutation,
  MutationCtx,
  env,
} from "./_generated/server";
import { apiMutation } from "./apiFunctions";
import { limitPerPerson } from "./limits";
import { checkRaid } from "./moderation";
import { inviteCodes } from "./violations";
import {
  DiscordChannel,
  DiscordMessage,
  DiscordThread,
  DiscordUser,
} from "./schema";

function tagSignature(tags: DiscordChannel["availableTags"]) {
  return (tags ?? [])
    .map(
      (t) =>
        `${t.id}:${t.name}:${t.moderated}:${t.emoji?.id ?? ""}:${t.emoji?.name ?? ""}`,
    )
    .sort()
    .join("|");
}

type DiscordRelatedTables = "users" | "channels" | "threads" | "messages";
const getOrCreate = async <TableName extends DiscordRelatedTables>(
  db: DatabaseWriter,
  table: TableName,
  doc: WithoutSystemFields<Doc<TableName>>,
) => {
  const existing = await db
    .query(table)
    .withIndex("id", (q) => q.eq("id", doc.id))
    .unique();

  if (existing) {
    return existing._id;
  }
  return await db.insert(table, doc);
};

const touchThread = async (
  { db }: { db: DatabaseWriter },
  { threadId }: { threadId: Id<"threads"> },
) => {
  const mostRecent = await db
    .query("threads")
    .withIndex("version")
    .order("desc")
    .first();
  const nextVersion = (mostRecent?.version ?? 0) + 1;
  await db.patch("threads", threadId, { version: nextVersion });
};

// eslint-disable-next-line @convex-dev/require-args-validator
export const addUniqueDoc = internalMutation({
  handler: async <TableName extends DiscordRelatedTables>(
    { db }: MutationCtx,
    {
      table,
      doc,
    }: {
      table: TableName;
      doc: WithoutSystemFields<Doc<TableName>>;
    },
  ) => {
    return await getOrCreate(db, table, doc);
  },
});

export const forceRefreshVersions = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("threads")
      .paginate({ cursor: args.cursor ?? null, numItems: 100 });
    const ids = results.page.map((d) => d._id);
    let nextVersion =
      (await ctx.db.query("threads").withIndex("version").order("desc").first())
        ?.version ?? 0;

    for (const threadId of ids) {
      await ctx.db.patch("threads", threadId, { version: nextVersion });
      nextVersion += 1;
    }
    if (!results.isDone) {
      await ctx.scheduler.runAfter(0, internal.discord.forceRefreshVersions, {
        cursor: results.continueCursor,
      });
    }
  },
});

// eslint-disable-next-line @convex-dev/require-args-validator
export const addThreadBatch = internalMutation({
  handler: async (
    { db },
    {
      authorsAndMessagesToAdd,
      threadId,
      channelId,
    }: {
      authorsAndMessagesToAdd: [DiscordUser, DiscordMessage][];
      threadId: Id<"threads">;
      channelId: Id<"channels">;
    },
  ) => {
    for (const [author, message] of authorsAndMessagesToAdd) {
      const authorId = await getOrCreate(db, "users", author);
      await getOrCreate(db, "messages", {
        ...message,
        authorId,
        threadId,
        channelId,
      });
    }
    await touchThread({ db }, { threadId });
  },
});

export const receiveMessage = apiMutation({
  args: {
    author: v.object(DiscordUser),
    message: v.object(DiscordMessage),
    channel: v.object(DiscordChannel),
    thread: v.optional(v.object(DiscordThread)),
    pingedTeam: v.optional(v.boolean()),
    privateChannel: v.optional(v.boolean()),
    fromModerator: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    {
      author,
      message,
      channel,
      thread,
      pingedTeam,
      privateChannel,
      fromModerator,
    },
  ) => {
    if (!message.content && !message.attachments?.length) {
      return;
    }
    const authorId = await getOrCreate(ctx.db, "users", author);
    const channelId = await getOrCreate(ctx.db, "channels", channel);
    let dbChannel = (await ctx.db.get("channels", channelId))!;
    if (
      tagSignature(dbChannel.availableTags) !==
      tagSignature(channel.availableTags)
    ) {
      await ctx.db.patch("channels", channelId, {
        availableTags: channel.availableTags,
      });
      dbChannel = { ...dbChannel, availableTags: channel.availableTags };
    }
    let dbThread, threadId;
    if (thread) {
      threadId = await getOrCreate(ctx.db, "threads", { ...thread, channelId });
      await touchThread(ctx, { threadId });
      dbThread = (await ctx.db.get("threads", threadId))!;
    }
    const messageId = await getOrCreate(ctx.db, "messages", {
      ...message,
      authorId,
      channelId,
      threadId,
      privateChannel,
      fromModerator,
    });

    const fromPerson =
      !author.bot && (message.type === 0 || message.type === 19);
    const checkable = fromPerson && !fromModerator;
    const partOfRaid =
      checkable &&
      (await checkRaid(
        ctx,
        messageId,
        !(await limitPerPerson(ctx, "raidCheck", author.id)).ok,
      ));

    if (threadId && thread && message.id === thread.id && !privateChannel) {
      await ctx.scheduler.runAfter(0, internal.tags.tagNewPost, { threadId });
    }

    if (checkable && /(^|\W)@(everyone|here)\b/.test(message.content)) {
      await ctx.scheduler.runAfter(0, internal.moderation.alertMassMention, {
        messageId,
      });
    }

    const codes = inviteCodes(message.content);
    if (checkable && codes.length) {
      await ctx.scheduler.runAfter(0, internal.moderation_node.checkInvites, {
        messageId,
        channelId: thread?.id ?? channel.id,
        codes,
      });
    }

    // Classifying is how a message gets forwarded, so a private channel still counts if it's the /forwardfrom channel.
    if (
      fromPerson &&
      !partOfRaid &&
      (!privateChannel ||
        (!thread &&
          (await ctx.db.query("guildSettings").take(50)).some(
            (s) => s.forwardFromChannelId === channel.id,
          )))
    ) {
      await ctx.scheduler.runAfter(0, internal.classify.classifyMessage, {
        messageId,
        pingedTeam,
      });
    }

    if (
      (message.type === 0 || message.type === 19) &&
      message.cleanContent &&
      dbChannel.slackChannelId
    ) {
      await ctx.scheduler.runAfter(0, internal.slack_node.sendMessage, {
        messageId,
        threadId,
        author: await slackAuthor(ctx.db, author),
        text: message.cleanContent,
        ...(dbThread
          ? threadSlackParams(dbChannel, dbThread)
          : {
              channel: dbChannel.slackChannelId,
              channelName: dbChannel.name,
            }),
      });
    }
  },
});

function makeLinkUrl(dbThread: Doc<"threads"> | undefined) {
  return dbThread
    ? `https://discord.com/channels/1019350475847499849/${dbThread.id}`
    : undefined;
}

// eslint-disable-next-line @convex-dev/require-args-validator
export const updateMessage = mutation({
  handler: async (
    { db, scheduler },
    {
      message,
      apiToken,
    }: { message: Partial<DiscordMessage> & { id: string }; apiToken: string },
  ) => {
    if (apiToken !== env.CONVEX_API_TOKEN) {
      throw new Error("Invalid API token");
    }
    const existing = await db
      .query("messages")
      .withIndex("id", (q) => q.eq("id", message.id))
      .unique();
    if (!existing) return;
    const { authorId, channelId, threadId } = existing;
    let dbThread;
    if (threadId) {
      await touchThread({ db }, { threadId });
      dbThread = await db.get("threads", threadId);
      if (!dbThread) {
        throw new Error("Thread not found:" + threadId);
      }
    }
    await db.patch("messages", existing._id, {
      ...message,
      authorId,
      channelId,
    });
    const channel = await db.get("channels", channelId);
    const author = await db.get("users", authorId);
    if (!channel || !author) {
      throw new Error("Channel or author not found:" + channelId + authorId);
    }
    if (channel.slackChannelId && existing.slackTs) {
      await scheduler.runAfter(0, internal.slack_node.updateMessage, {
        messageTs: existing.slackTs,
        channel: channel.slackChannelId,
        text: message.cleanContent ?? existing.cleanContent,
        author: await slackAuthor(db, author),
      });
    }
  },
});

const slackAuthor = async (db: DatabaseReader, author: DiscordUser) => {
  const registration = await db
    .query("registrations")
    .withIndex("discordUserId", (q) => q.eq("discordUserId", author.id))
    .first();
  return {
    name: author.displayName ?? author.nickname ?? author.username,
    username: author.username,
    avatarUrl: author.displayAvatarURL ?? author.avatarURL ?? undefined,
    associatedAccountId: registration?.associatedAccountId ?? null,
  };
};

export const deleteMessage = apiMutation({
  args: { id: v.string() },
  handler: async ({ db, scheduler }, { id }: { id: string }) => {
    const existing = await db
      .query("messages")
      .withIndex("id", (q) => q.eq("id", id))
      .unique();
    if (!existing) return;
    await db.patch("messages", existing._id, { deleted: true });
    const { threadId } = existing;
    if (threadId) {
      await touchThread({ db }, { threadId });
    }
    const channel = await db.get("channels", existing.channelId);
    if (!channel) throw new Error("Channel not found:" + existing.channelId);
    if (channel.slackChannelId && existing.slackTs) {
      await scheduler.runAfter(0, internal.slack_node.deleteMessage, {
        messageTs: existing.slackTs,
        channel: channel.slackChannelId,
      });
    }
  },
});

function threadSlackParams(channel: Doc<"channels">, thread: Doc<"threads">) {
  if (!channel.slackChannelId) {
    throw new Error("Channel not found:" + channel._id);
  }
  return {
    channel: channel.slackChannelId,
    channelName: channel.name,
    threadTs: thread.slackThreadTs!,
    title: thread.name + (thread.archived ? " (archived)" : ""),
    linkUrl: makeLinkUrl(thread),
    emojis:
      (thread.appliedTags
        ?.map(
          (tagId) =>
            channel.availableTags?.find((t) => t.id === tagId)?.emoji?.name,
        )
        .filter((e) => e) as string[]) ?? [],
  };
}

export const updateThread = apiMutation({
  args: {
    previous: v.object(DiscordThread),
    thread: v.object(DiscordThread),
  },
  handler: async ({ db, scheduler }, { previous, thread }) => {
    const existing = await db
      .query("threads")
      .withIndex("id", (q) => q.eq("id", previous.id ?? thread.id))
      .unique();
    if (!existing) return;
    await touchThread({ db }, { threadId: existing._id });
    const nowResolved =
      !existing.appliedTags.includes(resolvedTagId) &&
      thread.appliedTags.includes(resolvedTagId);
    await db.patch("threads", existing._id, thread);
    if (nowResolved) {
      const forward = await db
        .query("helpForwards")
        .withIndex("by_discordThreadId", (q) =>
          q.eq("discordThreadId", thread.id),
        )
        .first();
      if (forward && !forward.resolved) {
        await db.patch("helpForwards", forward._id, { resolved: true });
        await scheduler.runAfter(0, internal.followup_node.reactResolved, {
          sourceChannelId: forward.sourceChannelId,
          discordMessageId: forward.discordMessageId,
        });
      }
    }
    const channel = await db.get("channels", existing.channelId);
    if (!channel) throw new Error("Channel not found:" + existing.channelId);
    if (channel.slackChannelId && existing.slackThreadTs) {
      await scheduler.runAfter(
        0,
        internal.slack_node.updateThread,
        threadSlackParams(channel, { ...existing, ...thread }),
      );
    }
  },
});

export const deleteThread = apiMutation({
  args: { id: v.string() },
  handler: async ({ db, scheduler }, { id }) => {
    const existing = await db
      .query("threads")
      .withIndex("id", (q) => q.eq("id", id))
      .unique();
    if (!existing) return;
    await db.patch("threads", existing._id, { archived: true });
    const channel = await db.get("channels", existing.channelId);
    if (!channel) throw new Error("Channel not found:" + existing.channelId);
    if (channel.slackChannelId && existing.slackThreadTs) {
      await scheduler.runAfter(
        0,
        internal.slack_node.updateThread,
        threadSlackParams(channel, { ...existing, archived: true }),
      );
    }
  },
});

export const refreshThreads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const threads = await ctx.db.query("threads").order("desc").take(1000);
    let after = 0;
    for (const thread of threads) {
      const channel = await ctx.db.get("channels", thread.channelId);
      if (!channel) throw new Error("Channel not found:" + thread.channelId);
      if (channel.slackChannelId && thread.slackThreadTs) {
        await ctx.scheduler.runAfter(
          after,
          internal.slack_node.updateThread,
          threadSlackParams(channel, thread),
        );
        after += 1000;
      }
    }
  },
});

const resolvedTagId = env.DISCORD_RESOLVED_TAG_ID;

export const resolveThread = internalMutation({
  args: {
    threadId: v.id("threads"),
  },
  handler: async ({ db, scheduler }, { threadId }) => {
    const thread = await db.get("threads", threadId);
    if (!thread) {
      throw "Not a thread";
    }
    if (thread.appliedTags.indexOf(resolvedTagId) !== -1) {
      console.log("Tag already applied, refusing to apply");
      return;
    }
    if (!thread.channelId) {
      throw "No channel associated with the thread";
    }
    const channel = await db.get("channels", thread.channelId);
    if (!channel) throw new Error("Channel not found:" + thread.channelId);
    if (!channel.availableTags?.find((t) => t.id === resolvedTagId)) {
      console.log("Tag not found, refusing to apply");
      return;
    }
    const tags = [...thread.appliedTags, resolvedTagId];
    await db.patch("threads", threadId, {
      appliedTags: tags,
    });
    await touchThread({ db }, { threadId });
    await scheduler.runAfter(0, internal.discord_node.applyTags, {
      threadId: thread.id,
      tags,
    });
  },
});

export const getThreadByDiscordThreadId = internalQuery({
  args: {
    discordThreadId: v.string(),
  },
  handler: async ({ db }, { discordThreadId }) => {
    return await db
      .query("threads")
      .withIndex("id", (q) => q.eq("id", discordThreadId))
      .unique();
  },
});
