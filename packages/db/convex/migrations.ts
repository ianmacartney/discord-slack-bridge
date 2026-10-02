import {
  cancelMigration,
  getStatus,
  makeMigration,
  startMigrationsSerially,
} from "convex-helpers/server/migrations";
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Kept as scaffolding for the commented-out migrations below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const migration = makeMigration(internalMutation, {
  migrationTable: "migrations",
});

// export const deleteDeprecatedUserFields = migration({
//   table: "users",
//   migrateOne() {
//     return {
//       avatar: undefined,
//       defaultAvatarURL: undefined,
//       guildId: undefined,
//       userId: undefined,
//     };
//   },
// });

// export const deleteDeprecatedThreadFields = migration({
//   table: "threads",
//   migrateOne() {
//     return {
//       autoArchiveDuration: undefined,
//       guild: undefined,
//       lastMessageId: undefined,
//       lastPinTimestamp: undefined,
//       memberCount: undefined,
//       messageCount: undefined,
//       rateLimitPerUser: undefined,
//       totalMessageSent: undefined,
//     };
//   },
// });

// export const deleteDeprecatedChannelFields = migration({
//   table: "channels",
//   migrateOne() {
//     return {
//       defaultAutoArchiveDuration: undefined,
//       defaultForumLayout: undefined,
//       defaultReactionEmoji: undefined,
//       defaultSortOrder: undefined,
//       defaultThreadRateLimitPerUser: undefined,
//       guild: undefined,
//       guildId: undefined,
//       lastMessageId: undefined,
//       nsfw: undefined,
//       permissionOverwrites: undefined,
//       rateLimitPerUser: undefined,
//       rawPosition: undefined,
//     };
//   },
// });

// export const deleteDeprecatedMessageFields = migration({
//   table: "messages",
//   migrateOne() {
//     return {
//       activity: undefined,
//       applicationId: undefined,
//       attachments: undefined,
//       components: undefined,
//       embeds: undefined,
//       interaction: undefined,
//       guildId: undefined,
//       groupActivityApplicationId: undefined,
//       mentions: undefined,
//       nonce: undefined,
//       position: undefined,
//       roleSubscriptionData: undefined,
//       stickers: undefined,
//       tts: undefined,
//       webhookId: undefined,
//     };
//   },
// });

export const status = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await getStatus(ctx, { migrationTable: "migrations" });
  },
});

export const cancel = internalMutation({
  args: { fn: v.string() },
  handler: async (ctx, { fn }) => {
    // The migration name is a string at runtime; the helper wants a typed reference.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await cancelMigration(ctx, "migrations", fn as any);
  },
});

export default internalMutation({
  args: {},
  handler: async (ctx) => {
    await startMigrationsSerially(ctx, [
      // internal.migrations.deleteDeprecatedChannelFields,
      // internal.migrations.deleteDeprecatedMessageFields,
      // internal.migrations.deleteDeprecatedThreadFields,
      // internal.migrations.deleteDeprecatedUserFields,
    ]);
  },
});
