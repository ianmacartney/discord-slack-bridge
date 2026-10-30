import { defineSchema, defineTable } from "convex/server";
import { GenericValidator, ObjectType, v } from "convex/values";
import { Table } from "./utils";
import { migrationsTable } from "convex-helpers/server/migrations";

const nullable = <T extends GenericValidator>(validator: T) =>
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
      type: v.optional(v.number()),
    }),
  ),
  system: v.boolean(),
  type: v.number(),
  json: v.optional(v.any()),
  attachments: v.optional(
    v.array(
      v.object({
        name: v.string(),
        size: v.number(),
        contentType: nullable(v.string()),
      }),
    ),
  ),
};
export type DiscordMessage = ObjectType<typeof DiscordMessage>;
export const Messages = Table("messages", {
  authorId: v.id("users"),
  channelId: v.id("channels"),
  deleted: v.optional(v.boolean()),
  threadId: v.optional(v.id("threads")),
  slackTs: v.optional(v.string()),
  privateChannel: v.optional(v.boolean()),
  ...DiscordMessage,
});

export const DiscordThread = {
  appliedTags: v.array(v.string()),
  archiveTimestamp: nullable(v.number()),
  archived: nullable(v.boolean()),
  createdTimestamp: v.number(),
  flags: v.number(),
  guildId: v.optional(v.string()),
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
});

export const DiscordUser = {
  avatarURL: nullable(v.string()),
  bot: v.boolean(),
  createdTimestamp: v.number(),
  discriminator: v.string(),
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
  assignee: v.optional(v.id("employees")),
  status: v.union(v.literal("escalated"), v.literal("resolved")),
});
const tickets = Tickets.table
  .index("status", ["status"])
  .index("assignee", ["assignee"]);

export const Employees = Table("employees", {
  userId: v.id("users"),
  handlesTickets: v.boolean(),
  email: v.string(),
});

export const moderationActionKind = v.union(
  v.literal("delete"),
  v.literal("timeout"),
  v.literal("kick"),
  v.literal("ban"),
  v.literal("warn"),
  v.literal("untimeout"),
);
export const moderationActionStatus = v.union(
  v.literal("proposed"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("executed"),
  v.literal("dry_run"),
  v.literal("skipped"),
  v.literal("failed"),
);
export const ModerationActions = Table("moderationActions", {
  action: moderationActionKind,
  status: moderationActionStatus,
  auto: v.boolean(),
  dryRun: v.optional(v.boolean()),
  reason: v.string(),
  category: v.optional(v.string()),
  confidence: v.optional(v.number()),
  targetDiscordUserId: v.string(),
  channelId: v.string(),
  discordMessageId: v.optional(v.string()),
  durationMinutes: v.optional(v.number()),
  proposalMessageId: v.optional(v.string()),
  decidedBy: v.optional(v.string()),
  note: v.optional(v.string()),
  alertId: v.optional(v.id("modAlerts")),
  deleteMessageDays: v.optional(v.number()),
});

export const GuildSettings = Table("guildSettings", {
  guildId: v.string(),
  tagForumId: v.optional(nullable(v.string())),
  modChannelId: v.optional(nullable(v.string())),
  forwardFromChannelId: v.optional(nullable(v.string())),
  forwardToForumId: v.optional(nullable(v.string())),
  rulesChannelId: v.optional(nullable(v.string())),
  selfPromoChannelId: v.optional(nullable(v.string())),
  vipChannelIds: v.optional(v.array(v.string())),
});

export const ModAlerts = Table("modAlerts", {
  kind: v.string(),
  targetDiscordUserId: v.string(),
  channelId: v.string(),
  discordMessageId: v.string(),
  content: v.string(),
  confidence: v.optional(v.number()),
  reason: v.string(),
  timeoutActionId: v.optional(v.id("moderationActions")),
  status: v.union(v.literal("open"), v.literal("handled")),
  handledBy: v.optional(v.string()),
  handledAction: v.optional(v.string()),
  noteMessageId: v.optional(v.string()),
});

export const TagDecisions = Table("tagDecisions", {
  guildId: v.optional(v.string()),
  threadId: v.id("threads"),
  discordThreadId: v.string(),
  trigger: v.union(v.literal("creation"), v.literal("retag")),
  triggeredBy: v.optional(v.string()),
  decisions: v.array(
    v.object({
      question: v.string(),
      choice: v.string(),
      confidence: v.number(),
      tag: nullable(v.string()),
      note: nullable(v.string()),
    }),
  ),
  appliedTagIds: v.array(v.string()),
  status: v.union(
    v.literal("applied"),
    v.literal("nothing"),
    v.literal("undone"),
    v.literal("superseded"),
  ),
  noteMessageId: v.optional(v.string()),
  undoneBy: v.optional(v.string()),
  editedBy: v.optional(v.string()),
});

export const TagRules = Table("tagRules", {
  guildId: v.string(),
  key: v.string(),
  tag: v.string(),
  when: v.string(),
  kind: v.optional(v.union(v.literal("type"), v.literal("area"))),
  removed: v.optional(v.boolean()),
});

export const HelpForwards = Table("helpForwards", {
  discordMessageId: v.string(),
  sourceChannelId: v.string(),
  discordThreadId: v.string(),
  authorDiscordId: v.string(),
  resolved: v.optional(v.boolean()),
});

export const Raids = Table("raids", {
  authorId: v.id("users"),
  trigger: v.union(
    v.literal("rate_limit"),
    v.literal("cross_post"),
    v.literal("repeat"),
  ),
  fingerprint: v.optional(v.string()),
  channelIds: v.array(v.string()),
  messageIds: v.array(v.id("messages")),
  spreadSeconds: v.number(),
  spamScore: v.optional(v.number()),
  fastPath: v.optional(v.boolean()),
  decision: v.union(
    v.literal("pending"),
    v.literal("banned"),
    v.literal("ignored"),
  ),
});

export default defineSchema({
  raids: Raids.table.index("by_authorId", ["authorId"]),
  helpForwards: HelpForwards.table
    .index("by_discordMessageId", ["discordMessageId"])
    .index("by_discordThreadId", ["discordThreadId"]),
  tagRules: TagRules.table.index("by_guildId", ["guildId"]),
  modAlerts: ModAlerts.table.index("by_targetDiscordUserId", [
    "targetDiscordUserId",
  ]),
  tagDecisions: TagDecisions.table
    .index("by_threadId", ["threadId"])
    .index("by_guildId", ["guildId"]),
  guildSettings: GuildSettings.table.index("by_guildId", ["guildId"]),
  moderationActions: ModerationActions.table
    .index("by_status", ["status"])
    .index("by_targetDiscordUserId_and_action", [
      "targetDiscordUserId",
      "action",
    ]),
  channels: Channels.table.index("id", ["id"]),
  messages: Messages.table
    .index("id", ["id"])
    .index("slackTs", ["slackTs"])
    .index("threadId", ["threadId"])
    .index("channelId_threadId", ["channelId", "threadId"])
    .index("by_authorId", ["authorId"]),
  threads: Threads.table
    .index("id", ["id"])
    .index("slackThreadTs", ["slackThreadTs"])
    .index("version", ["version"]),
  users: Users.table
    .index("id", ["id"])
    .index("by_slackUserId", ["slackUserId"])
    .searchIndex("username", { searchField: "username" })
    .searchIndex("nickname", { searchField: "nickname" })
    .searchIndex("displayName", { searchField: "displayName" }),
  registrations: Registrations.table.index("discordUserId", ["discordUserId"]),
  threadSearchStatus: defineTable({
    indexedCursor: v.number(),
  }),
  tickets,
  employees: Employees.table
    .index("handlesTickets", ["handlesTickets"])
    .index("email", ["email"]),
  migrations: migrationsTable,
});
