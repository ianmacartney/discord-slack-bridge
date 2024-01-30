import { internal } from "./_generated/api";
import { WithoutSystemFields } from "convex/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  internalMutation,
  DatabaseWriter,
  MutationCtx,
  httpAction,
  DatabaseReader,
  action,
  internalQuery,
} from "./_generated/server";
import {
  DiscordThread,
  DiscordMessage,
  DiscordUser,
  DiscordChannel,
} from "./schema";
import { v } from "convex/values";

type DiscordRelatedTables = "users" | "channels" | "threads" | "messages";
const getOrCreate = async <TableName extends DiscordRelatedTables>(
  db: DatabaseWriter,
  table: TableName,
  doc: WithoutSystemFields<Doc<TableName>>
) => {
  const existing = await db
    .query(table)
    // types seem to bail, but all of them have an id index by other typing.
    .withIndex("id", (q) => q.eq("id", doc.id as any))
    .unique();
  if (existing) {
    return existing._id;
  }
  return await db.insert(table, doc);
};

const touchThread = async (
  { db }: { db: DatabaseWriter },
  { threadId }: { threadId: Id<"threads"> }
) => {
  // Get maximum version from any thread.
  const mostRecent = await db
    .query("threads")
    .withIndex("version")
    .order("desc")
    .first();
  const nextVersion = (mostRecent?.version ?? 0) + 1;
  await db.patch(threadId, { version: nextVersion });
};

export const addUniqueDoc = internalMutation({
  handler: async <TableName extends DiscordRelatedTables>(
    { db }: MutationCtx,
    {
      table,
      doc,
    }: {
      table: TableName;
      doc: WithoutSystemFields<Doc<TableName>>;
    }
  ) => {
    return await getOrCreate(db, table, doc);
  },
});

export const forceRefreshVersions = internalMutation({
  args: {},
  handler: async ({ db }, {}) => {
    const ids = (await db.query("threads").collect()).map((d) => d._id);
    for (const threadId of ids) {
      await touchThread({ db }, { threadId });
    }
  },
});

export const addThreadBatch = internalMutation(
  async (
    { db },
    {
      authorsAndMessagesToAdd,
      threadId,
      channelId,
    }: {
      authorsAndMessagesToAdd: [DiscordUser, DiscordMessage][];
      threadId: Id<"threads">;
      channelId: Id<"channels">;
    }
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
  }
);

export const receiveMessage = mutation({
  args: {
    author: v.object(DiscordUser),
    message: v.object(DiscordMessage),
    channel: v.object(DiscordChannel),
    thread: v.optional(v.object(DiscordThread)),
  },
  handler: async ({ db, scheduler }, { author, message, channel, thread }) => {
    const authorId = await getOrCreate(db, "users", author);
    const channelId = await getOrCreate(db, "channels", channel);
    const dbChannel = (await db.get(channelId))!;
    let dbThread, threadId;
    if (thread) {
      threadId = await getOrCreate(db, "threads", { ...thread, channelId });
      await touchThread({ db }, { threadId });
      dbThread = (await db.get(threadId))!;
    }
    const messageId = await getOrCreate(db, "messages", {
      ...message,
      authorId,
      channelId,
      threadId,
    });

    //TODO: handle message type USER_JOIN
    if (
      // 0: DEFAULT 19: REPLY
      (message.type === 0 || message.type === 19) &&
      dbChannel.slackChannelId
    ) {
      await scheduler.runAfter(0, internal.slack_node.sendMessage, {
        messageId,
        threadId,
        author: await slackAuthor(db, author),
        text: message.cleanContent,
        channel: dbChannel.slackChannelId,
        channelName: dbChannel.name,
        threadTs: dbThread?.slackThreadTs,
        title: dbThread?.name,
        linkUrl: makeLinkUrl(dbThread),
        emojis: dbThread?.appliedTags
          .map(
            (tagId) =>
              dbChannel.availableTags?.find((t) => t.id === tagId)?.emoji?.name
          )
          .filter((e) => e) as string[],
      });
    }
  },
});

function makeLinkUrl(dbThread: Doc<"threads"> | undefined) {
  return dbThread
    ? `https://discord.com/channels/${dbThread.guildId}/${dbThread.id}`
    : undefined;
}

export const updateMessage = mutation({
  // TODO: turn on validation after rollout & `partial` implementation
  // args: {
  //   message: v.object(partial(DiscordMessage))),
  // },
  handler: async (
    { db, scheduler },
    { message }: { message: Partial<DiscordMessage> & { id: string } }
  ) => {
    const existing = await db
      .query("messages")
      .withIndex("id", (q) => q.eq("id", message.id))
      .unique();
    if (!existing) return;
    const { authorId, channelId, threadId } = existing;
    let dbThread;
    if (threadId) {
      await touchThread({ db }, { threadId });
      dbThread = await db.get(threadId);
      if (!dbThread) {
        throw new Error("Thread not found:" + threadId);
      }
    }
    // Overwrite authorId & channelId
    await db.patch(existing._id, { ...message, authorId, channelId });
    const channel = await db.get(channelId);
    const author = await db.get(authorId);
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

export const deleteMessage = mutation({
  // args: MessageWithoutIds, // TODO; turn on validation after rollout
  handler: async ({ db, scheduler }, { id }: { id: string }) => {
    const existing = await db
      .query("messages")
      .withIndex("id", (q) => q.eq("id", id))
      .unique();
    if (!existing) return;
    await db.patch(existing._id, { deleted: true });
    const { threadId } = existing;
    if (threadId) {
      await touchThread({ db }, { threadId });
    }
    const channel = await db.get(existing.channelId);
    if (!channel) throw new Error("Channel not found:" + existing.channelId);
    if (channel.slackChannelId && existing.slackTs) {
      await scheduler.runAfter(0, internal.slack_node.deleteMessage, {
        messageTs: existing.slackTs,
        channel: channel.slackChannelId,
      });
    }
  },
});

export const updateThread = mutation({
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
    await db.patch(existing._id, thread);
    const channel = await db.get(existing.channelId);
    if (!channel) throw new Error("Channel not found:" + existing.channelId);
    if (channel.slackChannelId && existing.slackThreadTs) {
      await scheduler.runAfter(0, internal.slack_node.updateThread, {
        channel: channel.slackChannelId,
        threadTs: existing.slackThreadTs,
        title: thread.name,
        linkUrl: makeLinkUrl(existing),
        channelName: channel.name,
        emojis:
          (thread.appliedTags
            ?.map(
              (tagId) =>
                channel.availableTags?.find((t) => t.id === tagId)?.emoji?.name
            )
            .filter((e) => e) as string[]) ?? [],
      });
    }
  },
});

// TODO: make generic and look up dynamically
const ResolvedTagId = "1088163249410818230";

export const resolveThread = internalMutation({
  args: {
    threadId: v.id("threads"),
  },
  handler: async ({ db, scheduler }, { threadId }) => {
    const thread = await db.get(threadId);
    if (!thread) {
      throw "Not a thread";
    }
    if (thread.appliedTags.indexOf(ResolvedTagId) !== -1) {
      console.log("Tag already applied, refusing to apply");
      return;
    }
    if (!thread.channelId) {
      throw "No channel associated with the thread";
    }
    const channel = await db.get(thread.channelId);
    if (!channel) throw new Error("Channel not found:" + thread.channelId);
    if (!channel.availableTags?.find((t) => t.id === ResolvedTagId)) {
      console.log("Tag not found, refusing to apply");
      return;
    }
    const tags = [...thread.appliedTags, ResolvedTagId];
    await db.patch(threadId, {
      appliedTags: tags,
    });
    await touchThread({ db }, { threadId });
    await scheduler.runAfter(0, internal.discord_node.applyTags, {
      threadId: thread.id,
      tags,
    });
  },
});

export const registerAccountHandler = httpAction(
  async ({ runAction, runMutation }, request) => {
    authorizeWebhookRequest(request);
    const { associatedAccountId, discordId } = JSON.parse(await request.text());

    // Add the role
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId) throw new Error(`Guild ID not configured`);

    const roleId = process.env.DISCORD_VERIFIED_ROLE_ID;
    if (!roleId) throw new Error(`Verified role ID not configured`);

    await runAction(internal.actions.discord.addRole, {
      discordUserId: discordId,
      guildId,
      roleId,
    });

    await runMutation(internal.discord.insertRegistration, {
      discordUserId: discordId,
      associatedAccountId,
    });

    return new Response();
  }
);

export const unregisterAccountHandler = httpAction(
  async ({ runAction, runMutation }, request) => {
    authorizeWebhookRequest(request);
    const { discordId } = JSON.parse(await request.text());

    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId) throw new Error(`Guild ID not configured`);

    const roleId = process.env.DISCORD_VERIFIED_ROLE_ID;
    if (!roleId) throw new Error(`Verified role ID not configured`);

    await runAction(internal.actions.discord.removeRole, {
      discordUserId: discordId,
      guildId,
      roleId,
    });

    await runMutation(internal.discord.deleteRegistration, {
      discordUserId: discordId,
    });

    return new Response();
  }
);

function authorizeWebhookRequest(request: Request) {
  const webhookToken = process.env.WEBHOOK_TOKEN;
  if (!webhookToken) {
    throw new Error("Token for webhook requests not set");
  }

  if (request.headers.get("Authorization") !== `Bearer ${webhookToken}`) {
    throw new Error("Token for webhook requests invalid");
  }
}

export const insertRegistration = internalMutation({
  args: {
    discordUserId: v.string(),
    associatedAccountId: v.string(),
  },
  handler: async ({ db }, { discordUserId, associatedAccountId }) => {
    await deleteRegistrations(db, discordUserId);
    await db.insert("registrations", { discordUserId, associatedAccountId });
  },
});

export const deleteRegistration = internalMutation({
  args: {
    discordUserId: v.string(),
  },
  handler: async ({ db }, { discordUserId }) => {
    await deleteRegistrations(db, discordUserId);
  },
});

async function deleteRegistrations(db: DatabaseWriter, discordUserId: string) {
  const existingRows = await db
    .query("registrations")
    .withIndex("discordUserId", (q) => q.eq("discordUserId", discordUserId))
    .collect();
  for (const { _id } of existingRows) {
    await db.delete(_id);
  }
}

export const isAccountLinked = internalQuery({
  args: {
    discordUserId: v.string(),
  },
  handler: async ({ db }, { discordUserId }) => {
    const registration = await db
      .query("registrations")
      .withIndex("discordUserId", (q) => q.eq("discordUserId", discordUserId))
      .first();
    return registration !== null;
  },
});

export const addRoleIfAccountLinked = action({
  args: {
    discordUserId: v.string(),
  },
  handler: async ({ runQuery, runAction }, { discordUserId }) => {
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId) throw new Error(`Guild ID not configured`);

    const roleId = process.env.DISCORD_VERIFIED_ROLE_ID;
    if (!roleId) throw new Error(`Verified role ID not configured`);

    const isAccountLinked = await runQuery(internal.discord.isAccountLinked, {
      discordUserId,
    });

    if (isAccountLinked) {
      await runAction(internal.actions.discord.addRole, {
        guildId,
        discordUserId,
        roleId,
      });
    }
  },
});
