import { defineSchema, defineTable } from "convex/schema";
import { v } from "convex/values";

export default defineSchema({
  channels: defineTable({
    availableTags: v.optional(
      v.array(
        v.object({
          emoji: v.union(
            v.null(),
            v.object({ id: v.null(), name: v.string() })
          ),
          id: v.string(),
          moderated: v.boolean(),
          name: v.string(),
        })
      )
    ),
    createdTimestamp: v.number(),
    defaultAutoArchiveDuration: v.optional(v.null()),
    defaultForumLayout: v.optional(v.number()),
    defaultReactionEmoji: v.optional(
      v.object({ id: v.null(), name: v.string() })
    ),
    defaultSortOrder: v.optional(v.null()),
    defaultThreadRateLimitPerUser: v.optional(v.null()),
    flags: v.number(),
    guild: v.string(),
    guildId: v.string(),
    id: v.string(),
    indexForSearch: v.optional(v.boolean()),
    lastMessageId: v.optional(v.string()),
    name: v.string(),
    nsfw: v.boolean(),
    parentId: v.string(),
    permissionOverwrites: v.array(v.string()),
    rateLimitPerUser: v.optional(v.number()),
    rawPosition: v.number(),
    slackChannelId: v.optional(v.string()),
    topic: v.union(v.null(), v.string()),
    type: v.number(),
  }).index("id", ["id"]),
  messages: defineTable({
    activity: v.null(),
    applicationId: v.null(),
    attachments: v.array(v.string()),
    authorId: v.id("users"),
    channelId: v.id("channels"),
    cleanContent: v.string(),
    components: v.array(v.any()),
    content: v.string(),
    createdTimestamp: v.number(),
    deleted: v.optional(v.boolean()),
    editedTimestamp: v.union(v.null(), v.number()),
    embeds: v.array(v.any()),
    flags: v.number(),
    groupActivityApplicationId: v.null(),
    guildId: v.string(),
    id: v.string(),
    interaction: v.null(),
    mentions: v.object({
      channels: v.array(v.string()),
      crosspostedChannels: v.array(v.any()),
      everyone: v.boolean(),
      members: v.array(v.string()),
      repliedUser: v.union(v.null(), v.string()),
      roles: v.array(v.any()),
      users: v.array(v.string()),
    }),
    nonce: v.union(v.null(), v.string()),
    pinned: v.boolean(),
    position: v.union(v.null(), v.number()),
    reference: v.union(
      v.null(),
      v.object({
        channelId: v.string(),
        guildId: v.string(),
        messageId: v.optional(v.string()),
      })
    ),
    roleSubscriptionData: v.null(),
    slackTs: v.optional(v.string()),
    stickers: v.array(v.any()),
    system: v.boolean(),
    threadId: v.optional(v.id("threads")),
    tts: v.boolean(),
    type: v.number(),
    webhookId: v.null(),
  })
    .index("id", ["id"])
    .index("slackTs", ["slackTs"])
    .index("threadId", ["threadId"]),
  threads: defineTable({
    appliedTags: v.array(v.string()),
    archiveTimestamp: v.number(),
    archived: v.boolean(),
    autoArchiveDuration: v.number(),
    channelId: v.id("channels"),
    createdTimestamp: v.number(),
    flags: v.number(),
    guild: v.string(),
    guildId: v.string(),
    id: v.string(),
    invitable: v.null(),
    lastMessageId: v.string(),
    lastPinTimestamp: v.null(),
    locked: v.boolean(),
    memberCount: v.number(),
    messageCount: v.number(),
    name: v.string(),
    ownerId: v.string(),
    parentId: v.string(),
    rateLimitPerUser: v.number(),
    slackThreadTs: v.optional(v.string()),
    totalMessageSent: v.number(),
    type: v.number(),
    version: v.optional(v.number()),
  })
    .index("id", ["id"])
    .index("slackThreadTs", ["slackThreadTs"])
    .index("version", ["version"]),
  users: defineTable({
    avatar: v.union(v.null(), v.string()),
    avatarURL: v.union(v.null(), v.string()),
    bot: v.boolean(),
    createdTimestamp: v.number(),
    defaultAvatarURL: v.string(),
    discriminator: v.string(),
    displayAvatarURL: v.string(),
    displayName: v.string(),
    flags: v.number(),
    guildId: v.string(),
    id: v.string(),
    joinedTimestamp: v.number(),
    memberId: v.string(),
    nickname: v.union(v.null(), v.string()),
    pending: v.boolean(),
    roles: v.array(v.string()),
    slackUserId: v.optional(v.string()),
    system: v.boolean(),
    tag: v.string(),
    userId: v.string(),
    username: v.string(),
  }).index("id", ["id"]),
  threadSearchStatus: defineTable({
    indexedCursor: v.number(),
  }),
});
