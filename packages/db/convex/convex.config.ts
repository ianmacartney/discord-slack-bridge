import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    CONVEX_API_TOKEN: v.string(),
    DISCORD_TOKEN: v.string(),
    DISCORD_RESOLVED_TAG_ID: v.string(),
    SLACK_TOKEN: v.string(),
    // Optional features: indexing to Algolia and the verification flow.
    ALGOLIA_API_KEY: v.optional(v.string()),
    VERIFICATION_DISCORD_TOKEN: v.optional(v.string()),
    VERIFICATION_GUILD_ID: v.optional(v.string()),
    VERIFICATION_ROLE_ID: v.optional(v.string()),
    VERIFICATION_WEBHOOK_TOKEN: v.optional(v.string()),
    // Used by the auto-reply to new support threads.
    AUTO_REPLY_CHANNEL_ID: v.optional(v.string()),
  },
});

export default app;
