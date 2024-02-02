import { defineSchema, defineTable } from "convex/server";
import { ObjectType, Validator, v } from "convex/values";
import { Table } from "./utils";

// Utility validators
const deprecated = v.optional(v.any());
const nullable = <T extends Validator<any, any, any>>(validator: T) =>
  v.union(v.null(), validator);

export const DiscordChannel = {
  availableTags: v.optional(
    v.array(
      v.object({
        emoji: nullable(
          v.object({ id: nullable(v.string()), name: nullable(v.string()) }),
        ),
        id: v.string(),
        moderated: v.boolean(),
        name: v.string(),
      }),
    ),
  ),
  createdTimestamp: nullable(v.number()),
  flags: v.optional(v.number()),
  id: v.string(),
  name: v.string(),
  parentId: nullable(v.string()),
  topic: nullable(v.string()),
  type: v.number(),
};
export type DiscordChannel = ObjectType<typeof DiscordChannel>;
export const Channels = Table("channels", {
  slackChannelId: v.optional(v.string()),
  indexForSearch: v.optional(v.boolean()),
  ...DiscordChannel,
  // Legacy fields
  defaultAutoArchiveDuration: deprecated,
  defaultForumLayout: deprecated,
  defaultReactionEmoji: deprecated,
  defaultSortOrder: deprecated,
  defaultThreadRateLimitPerUser: deprecated,
  guild: deprecated,
  guildId: deprecated,
  lastMessageId: deprecated,
  nsfw: deprecated,
  permissionOverwrites: deprecated,
  rateLimitPerUser: deprecated,
  rawPosition: deprecated,
});

export const DiscordMessage = {
  cleanContent: v.string(),
  content: v.string(),
  createdTimestamp: v.number(),
  editedTimestamp: nullable(v.number()),
  flags: v.number(),
  id: v.string(),
  pinned: v.boolean(),
  reference: nullable(
    v.object({
      channelId: v.string(),
      guildId: v.optional(v.string()),
      messageId: v.optional(v.string()),
    }),
  ),
  system: v.boolean(),
  type: v.number(),
  json: v.optional(v.any()),
};
export type DiscordMessage = ObjectType<typeof DiscordMessage>;
export const Messages = Table("messages", {
  authorId: v.id("users"),
  channelId: v.id("channels"),
  deleted: v.optional(v.boolean()),
  threadId: v.optional(v.id("threads")),
  slackTs: v.optional(v.string()),
  ...DiscordMessage,
  // Legacy fields
  activity: deprecated,
  applicationId: deprecated,
  attachments: deprecated,
  components: deprecated,
  embeds: deprecated,
  interaction: deprecated,
  guildId: deprecated,
  groupActivityApplicationId: deprecated,
  mentions: deprecated,
  nonce: deprecated,
  position: deprecated,
  roleSubscriptionData: deprecated,
  stickers: deprecated,
  tts: deprecated,
  webhookId: deprecated,
});

export const DiscordThread = {
  appliedTags: v.array(v.string()),
  archiveTimestamp: nullable(v.number()),
  archived: nullable(v.boolean()),
  createdTimestamp: v.number(),
  flags: v.number(),
  id: v.string(),
  invitable: nullable(v.boolean()),
  locked: nullable(v.boolean()),
  name: v.string(),
  ownerId: nullable(v.string()),
  parentId: nullable(v.string()),
  type: v.number(),
};
export type DiscordThread = ObjectType<typeof DiscordThread>;
export const Threads = Table("threads", {
  channelId: v.id("channels"),
  slackThreadTs: v.optional(v.string()),
  version: v.optional(v.number()),
  ...DiscordThread,
  // Legacy fields
  autoArchiveDuration: deprecated,
  guild: deprecated,
  guildId: deprecated,
  lastMessageId: deprecated,
  lastPinTimestamp: deprecated,
  memberCount: deprecated,
  messageCount: deprecated,
  rateLimitPerUser: deprecated,
  totalMessageSent: deprecated,
});

export const DiscordUser = {
  avatarURL: nullable(v.string()),
  bot: v.boolean(),
  createdTimestamp: v.number(),
  discriminator: v.string(), // '8678' e.g.
  displayAvatarURL: nullable(v.string()),
  displayName: v.optional(v.string()),
  flags: v.number(),
  id: v.string(),
  joinedTimestamp: nullable(v.number()),
  memberId: v.optional(v.string()),
  nickname: nullable(v.string()),
  pending: v.optional(v.boolean()),
  roles: v.array(v.string()),
  system: v.boolean(),
  tag: v.string(),
  username: v.string(),
};
export type DiscordUser = ObjectType<typeof DiscordUser>;
export const Users = Table("users", {
  slackUserId: v.optional(v.string()),
  ...DiscordUser,
  // Legacy fields
  avatar: deprecated,
  defaultAvatarURL: deprecated,
  guildId: deprecated,
  userId: deprecated,
});

export const Registrations = Table("registrations", {
  discordUserId: v.string(),
  associatedAccountId: v.string(),
});

export const Tickets = Table("tickets", {
  updateTime: v.number(),
  source: v.object({
    type: v.literal("discord"),
    id: v.id("threads"),
  }),
  assignee: v.optional(v.id("users")),
  status: v.union(v.literal("escalated"), v.literal("resolved")),
});

export const Employees = Table("employees", {
  userId: v.id("users"),
  handlesTickets: v.boolean(),
  email: v.string(),
});

export default defineSchema({
  channels: Channels.table.index("id", ["id"]),
  messages: Messages.table
    .index("id", ["id"])
    .index("slackTs", ["slackTs"])
    .index("threadId", ["threadId"]),
  threads: Threads.table
    .index("id", ["id"])
    .index("slackThreadTs", ["slackThreadTs"])
    .index("version", ["version"]),
  users: Users.table
    .index("id", ["id"])
    .searchIndex("username", { searchField: "username" })
    .searchIndex("nickname", { searchField: "nickname" })
    .searchIndex("displayName", { searchField: "displayName" }),
  registrations: Registrations.table.index("discordUserId", ["discordUserId"]),
  threadSearchStatus: defineTable({
    indexedCursor: v.number(),
  }),
  tickets: Tickets.table.index("status", ["status"]),
  employees: Employees.table
    .index("handlesTickets", ["handlesTickets"])
    .index("email", ["email"]),
});
