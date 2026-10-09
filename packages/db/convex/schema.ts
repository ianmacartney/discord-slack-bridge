import { defineSchema, defineTable } from "convex/server";
import { GenericValidator, ObjectType, v } from "convex/values";
import { Table } from "./utils";
import { migrationsTable } from "convex-helpers/server/migrations";

// Utility validators
// const deprecated = v.optional(v.any()) as Validator<null, true>;
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
  v.literal("warn"), // a DM telling the person a moderator warned them
  v.literal("untimeout"), // lifts a timeout, for a card dismissed as a mistake
);
export const moderationActionStatus = v.union(
  v.literal("proposed"), // waiting for execution (auto) or for a human decision
  v.literal("approved"), // a human approved it; execution is scheduled
  v.literal("rejected"),
  v.literal("executed"),
  v.literal("dry_run"), // would have run, but dry-run mode is on
  v.literal("skipped"), // a safety check blocked it; see `note`
  v.literal("failed"),
);
export const ModerationActions = Table("moderationActions", {
  action: moderationActionKind,
  status: moderationActionStatus,
  // true: runs without a human; false: needs an Approve click in the mod channel.
  auto: v.boolean(),
  dryRun: v.boolean(),
  reason: v.string(),
  category: v.optional(v.string()),
  confidence: v.optional(v.number()),
  targetDiscordUserId: v.string(),
  // Discord channel (or thread) id the message lives in; used to find the guild.
  channelId: v.string(),
  discordMessageId: v.optional(v.string()),
  durationMinutes: v.optional(v.number()),
  proposalMessageId: v.optional(v.string()),
  decidedBy: v.optional(v.string()),
  note: v.optional(v.string()),
  // The mod-channel card this action belongs to, if any. The card reports on it, so it is not logged separately.
  alertId: v.optional(v.id("modAlerts")),
});

// Per-server settings: the support forum to auto-tag (/tags), the mod channel and the ask-ai channel.
// vipChannelId and linkAllowedRoleIds are unused and kept so existing rows stay valid.
export const GuildSettings = Table("guildSettings", {
  guildId: v.string(),
  // Anyone who can view this channel may post links.
  vipChannelId: nullable(v.string()),
  // Roles allowed to post links, in addition to the VIP channel's viewers.
  linkAllowedRoleIds: v.array(v.string()),
  // The support forum whose new posts get auto-tagged, set with the bot's /tags command. Unset: no auto-tagging.
  tagForumId: v.optional(nullable(v.string())),
  // Private channel for mod-only posts (auto-tag notes with Undo, moderation proposals), set with /modchannel.
  modChannelId: v.optional(nullable(v.string())),
  // Where people can get a quick AI answer first (the ask-ai channel), set with /askai. Mentioned in the follow-up.
  askAiChannelId: v.optional(nullable(v.string())),
  // The chat channel (usually #general) whose long help requests are forwarded to the support forum, set with /forwardfrom.
  forwardFromChannelId: v.optional(nullable(v.string())),
  // The support forum those requests are opened in, set with /forwardfrom. Unset: the /tags forum.
  forwardToForumId: v.optional(nullable(v.string())),
});

// A rule violation that triggered a mod-channel card ("Spam detected", ...) with action buttons.
export const ModAlerts = Table("modAlerts", {
  kind: v.string(), // a key of VIOLATION_TITLES in violations.ts
  targetDiscordUserId: v.string(),
  channelId: v.string(),
  discordMessageId: v.string(),
  // The deleted message's text (truncated), so moderators can judge it from the card.
  content: v.string(),
  confidence: v.optional(v.number()),
  reason: v.string(),
  // The automatic 1-day timeout, so Dismiss can lift it.
  timeoutActionId: v.optional(v.id("moderationActions")),
  status: v.union(v.literal("open"), v.literal("handled")),
  handledBy: v.optional(v.string()),
  handledAction: v.optional(v.string()),
  noteMessageId: v.optional(v.string()),
});

// One row per auto-tag decision (on post creation, or a mod's /tags retag), whether or not it applied anything.
// Powers the mod-channel note, Undo, and /tags audit.
export const TagDecisions = Table("tagDecisions", {
  guildId: v.optional(v.string()),
  threadId: v.id("threads"),
  discordThreadId: v.string(),
  trigger: v.union(v.literal("creation"), v.literal("retag")),
  // Discord user id of the mod who ran /tags retag.
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
  // The tags the bot set on the post (so Undo and /tags retag only touch the bot's own tags).
  appliedTagIds: v.array(v.string()),
  status: v.union(
    v.literal("applied"),
    v.literal("nothing"), // Jev decided, but no tag passed the checks
    v.literal("undone"), // a mod pressed Undo
    v.literal("superseded"), // replaced by a later /tags retag
  ),
  noteMessageId: v.optional(v.string()),
  undoneBy: v.optional(v.string()),
  // A moderator picked the tags by hand with the card's Edit button; appliedTagIds is then their final choice.
  editedBy: v.optional(v.string()),
});

// Confidence cut-offs changed with /confidence. They apply to the whole bot, because messages don't record their
// server. A missing row means the default in THRESHOLD_DEFAULTS (violations.ts).
export const Thresholds = Table("thresholds", {
  name: v.string(),
  value: v.number(),
});

// Changes a server made to the auto-tagger's definitions (see tagDefinitions.ts) with /tags rule. A row with the key
// of a built-in definition overrides it, or hides it when `removed` is true. Any other key is a definition the
// server added.
export const TagRules = Table("tagRules", {
  guildId: v.string(),
  kind: v.union(v.literal("type"), v.literal("area")),
  key: v.string(),
  tag: v.string(),
  when: v.string(),
  removed: v.optional(v.boolean()),
});

// A help request the bot forwarded from chat into its own support-forum post. Links the two so the original message
// gets a thumbs up once the post is resolved.
export const HelpForwards = Table("helpForwards", {
  discordMessageId: v.string(),
  sourceChannelId: v.string(),
  discordThreadId: v.string(),
  authorDiscordId: v.string(),
  resolved: v.optional(v.boolean()),
});

export default defineSchema({
  helpForwards: HelpForwards.table
    .index("by_discordMessageId", ["discordMessageId"])
    .index("by_discordThreadId", ["discordThreadId"]),
  tagRules: TagRules.table.index("by_guildId", ["guildId"]),
  thresholds: Thresholds.table.index("by_name", ["name"]),
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
    .index("threadId", ["threadId"]),
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
