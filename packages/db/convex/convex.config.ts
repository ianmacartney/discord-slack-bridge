import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    CONVEX_API_TOKEN: v.string(),
    DISCORD_TOKEN: v.string(),
    DISCORD_RESOLVED_TAG_ID: v.string(),
    SLACK_TOKEN: v.string(),
    ALGOLIA_API_KEY: v.optional(v.string()),
    VERIFICATION_DISCORD_TOKEN: v.optional(v.string()),
    VERIFICATION_GUILD_ID: v.optional(v.string()),
    VERIFICATION_ROLE_ID: v.optional(v.string()),
    VERIFICATION_WEBHOOK_TOKEN: v.optional(v.string()),
    AUTO_REPLY_CHANNEL_ID: v.optional(v.string()),
    // Fallback for the ask-ai channel mentioned in the needs-help follow-up. Prefer the /askai command.
    ASK_AI_CHANNEL_ID: v.optional(v.string()),
    MODERATION_DRY_RUN: v.optional(v.string()),
    MOD_CHANNEL_ID: v.optional(v.string()),
    MODERATION_EXEMPT_USER_IDS: v.optional(v.string()),
    MODERATION_ALLOW_BOT_TARGETS: v.optional(v.string()),
  },
});

app.use(rateLimiter);

export default app;
