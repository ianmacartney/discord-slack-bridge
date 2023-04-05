import { mutation, internalMutation } from "./_generated/server";

const addUnique = async (db, table, doc) => {
  const existing = await db
    .query(table)
    .withIndex("id", (q) => q.eq("id", doc.id))
    .unique();
  if (existing) {
    return existing._id;
  }
  return await db.insert(table, doc);
};

export const addUniqueDoc = internalMutation(
  async ({ db }, { table, doc, primaryKey }) => {
    return await addUnique(db, table, doc, primaryKey);
  }
);

export const addThreadBatch = internalMutation(
  async ({ db }, { authorsAndMessagesToAdd }) => {
    for (const [author, message] of authorsAndMessagesToAdd) {
      const authorId = await addUnique(db, "users", author);
      await addUnique(db, "messages", { ...message, authorId });
    }
  }
);

export const receiveMessage = mutation(
  async ({ db, scheduler }, { author, message, channel, thread }) => {
    const authorId = await addUnique(db, "users", author);
    const channelId = await addUnique(db, "channels", channel);
    const dbChannel = await db.get(channelId);
    let dbThread, threadId;
    if (thread) {
      threadId = await addUnique(db, "threads", { ...thread, channelId });
      dbThread = await db.get(threadId);
    }
    const messageId = await addUnique(db, "messages", {
      ...message,
      authorId,
      channelId,
      threadId,
    });

    if (!author.bot && dbChannel.slackChannelId) {
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
        threadTs: dbThread?.slackThreadTs,
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
      .withIndex("id", (q) => q.eq("id", previous.id))
      .unique();
    await db.patch(existing._id, message);
    const channel = await db.get(existing.channelId);
    if (channel.slackChannelId && existing.slackTs) {
      scheduler.runAfter(0, "actions/slack:updateMessage", {
        messageTs: existing.slackTs,
        channel: channel.slackChannelId,
      });
    }
  }
);

export const deleteMessage = mutation(async ({ db, scheduler }, message) => {
  const existing = await db
    .query("messages")
    .withIndex("id", (q) => q.eq("id", message.id))
    .unique();
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
      .withIndex("id", (q) => q.eq("id", previous.id))
      .unique();
    await db.patch(existing._id, thread);
    const channel = await db.get(existing.channelId);
    if (channel.slackChannelId && existing.slackThreadTs) {
      scheduler.runAfter(0, "actions/slack:updateThread", {
        channel: channel.slackChannelId,
        threadTs: existing.slackThreadTs,
        emojis: dbThread?.appliedTags.map(
          (tagId) =>
            dbChannel.availableTags.find((t) => t.id === tagId)?.emoji.name
        ),
      });
    }
  }
);
