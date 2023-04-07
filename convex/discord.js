import { mutation, internalMutation } from "./_generated/server";

const getOrCreate = async (db, table, doc) => {
  const existing = await db
    .query(table)
    .withIndex("id", (q) => q.eq("id", doc.id))
    .unique();
  if (existing) {
    return existing._id;
  }
  return await db.insert(table, doc);
};

export const addUniqueDoc = internalMutation(async ({ db }, { table, doc }) => {
  return await getOrCreate(db, table, doc);
});

export const addThreadBatch = internalMutation(
  async ({ db }, { authorsAndMessagesToAdd }) => {
    for (const [author, message] of authorsAndMessagesToAdd) {
      const authorId = await getOrCreate(db, "users", author);
      await getOrCreate(db, "messages", { ...message, authorId });
    }
  }
);

export const receiveMessage = mutation(
  async ({ db, scheduler }, { author, message, channel, thread }) => {
    const authorId = await getOrCreate(db, "users", author);
    /** @type { import("./_generated/dataModel").Id<"channels">} */
    const channelId = await getOrCreate(db, "channels", channel);
    const dbChannel = await db.get(channelId);
    let dbThread, threadId;
    if (thread) {
      threadId = await getOrCreate(db, "threads", { ...thread, channelId });
      dbThread = await db.get(threadId);
    }
    const messageId = await getOrCreate(db, "messages", {
      ...message,
      authorId,
      channelId,
      threadId,
    });

    //TODO: handle message type USER_JOIN
    if (
      // 0: DEFAULT 19: REPLY 21: THREAD_STARTER_MESSAGE
      (message.type === 0 || message.type === 19 || message.type === 21) &&
      dbChannel.slackChannelId
    ) {
      scheduler.runAfter(0, "actions/slack:sendMessage", {
        messageId,
        threadId,
        author: {
          name: author.displayName,
          username: author.username,
          avatarUrl: author.displayAvatarURL || author.avatarUrl,
        },
        text: message.cleanContent,
        channel: dbChannel.slackChannelId,
        channelName: dbChannel.name,
        threadTs: dbThread?.slackThreadTs,
        title: dbThread?.name,
        emojis: dbThread?.appliedTags.map(
          (tagId) =>
            dbChannel.availableTags.find((t) => t.id === tagId)?.emoji.name
        ),
      });
    }
  }
);

export const updateMessage = mutation(
  async ({ db, scheduler }, { previous, message }) => {
    const existing = await db
      .query("messages")
      .withIndex("id", (q) => q.eq("id", previous.id ?? message.id))
      .unique();
    if (!existing) return;
    const { authorId, channelId } = existing;
    // Overwrite authorId & channelId
    await db.patch(existing._id, { ...message, authorId, channelId });
    const channel = await db.get(channelId);
    const author = await db.get(authorId);
    if (channel.slackChannelId && existing.slackTs) {
      scheduler.runAfter(0, "actions/slack:updateMessage", {
        messageTs: existing.slackTs,
        channel: channel.slackChannelId,
        text: message.cleanContent,
        author: {
          name: author.displayName,
          username: author.username,
          avatarUrl: author.displayAvatarURL || author.avatarUrl,
        },
      });
    }
  }
);

export const deleteMessage = mutation(async ({ db, scheduler }, message) => {
  const existing = await db
    .query("messages")
    .withIndex("id", (q) => q.eq("id", message.id))
    .unique();
  if (!existing) return;
  await db.patch(existing._id, { deleted: true });
  const channel = await db.get(existing.channelId);
  if (channel.slackChannelId && existing.slackTs) {
    scheduler.runAfter(0, "actions/slack:deleteMessage", {
      messageTs: existing.slackTs,
      channel: channel.slackChannelId,
    });
  }
});

export const updateThread = mutation(
  async ({ db, scheduler }, { previous, thread }) => {
    const existing = await db
      .query("threads")
      .withIndex("id", (q) => q.eq("id", previous.id ?? thread.id))
      .unique();
    await db.patch(existing._id, thread);
    if (!existing) return;
    const channel = await db.get(existing.channelId);
    if (channel.slackChannelId && existing.slackThreadTs) {
      scheduler.runAfter(0, "actions/slack:updateThread", {
        channel: channel.slackChannelId,
        threadTs: existing.slackThreadTs,
        title: thread.name,
        channelName: channel.name,
        emojis: existing?.appliedTags?.map(
          (tagId) =>
            channel.availableTags.find((t) => t.id === tagId)?.emoji.name
        ),
      });
    }
  }
);

// TODO: make generic and look up dynamically
const ResolvedTagId = "1088163249410818230";

export const resolveThread = internalMutation(
  async ({ db, scheduler }, { threadId }) => {
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
    if (!channel.availableTags.find((t) => t.id === ResolvedTagId)) {
      console.log("Tag not found, refusing to apply");
      return;
    }
    const tags = [...thread.appliedTags, ResolvedTagId];
    await db.patch(threadId, { appliedTags: tags });
    scheduler.runAfter(0, "actions/discord:applyTags", {
      threadId: thread.id,
      tags,
    });
  }
);
