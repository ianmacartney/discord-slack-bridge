/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as algolia from "../algolia.js";
import type * as apiFunctions from "../apiFunctions.js";
import type * as brandColors from "../brandColors.js";
import type * as classify from "../classify.js";
import type * as decisions from "../decisions.js";
import type * as discord from "../discord.js";
import type * as discord_node from "../discord_node.js";
import type * as followup from "../followup.js";
import type * as followup_node from "../followup_node.js";
import type * as guildSettings from "../guildSettings.js";
import type * as http from "../http.js";
import type * as indexing from "../indexing.js";
import type * as limits from "../limits.js";
import type * as migrations from "../migrations.js";
import type * as moderation from "../moderation.js";
import type * as moderation_node from "../moderation_node.js";
import type * as slack from "../slack.js";
import type * as slack_node from "../slack_node.js";
import type * as slowdown from "../slowdown.js";
import type * as slowdown_node from "../slowdown_node.js";
import type * as tagDefinitions from "../tagDefinitions.js";
import type * as tagRules from "../tagRules.js";
import type * as tags from "../tags.js";
import type * as tags_node from "../tags_node.js";
import type * as thresholds from "../thresholds.js";
import type * as tickets from "../tickets.js";
import type * as users from "../users.js";
import type * as utils from "../utils.js";
import type * as verification from "../verification.js";
import type * as verification_node from "../verification_node.js";
import type * as violations from "../violations.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  algolia: typeof algolia;
  apiFunctions: typeof apiFunctions;
  brandColors: typeof brandColors;
  classify: typeof classify;
  decisions: typeof decisions;
  discord: typeof discord;
  discord_node: typeof discord_node;
  followup: typeof followup;
  followup_node: typeof followup_node;
  guildSettings: typeof guildSettings;
  http: typeof http;
  indexing: typeof indexing;
  limits: typeof limits;
  migrations: typeof migrations;
  moderation: typeof moderation;
  moderation_node: typeof moderation_node;
  slack: typeof slack;
  slack_node: typeof slack_node;
  slowdown: typeof slowdown;
  slowdown_node: typeof slowdown_node;
  tagDefinitions: typeof tagDefinitions;
  tagRules: typeof tagRules;
  tags: typeof tags;
  tags_node: typeof tags_node;
  thresholds: typeof thresholds;
  tickets: typeof tickets;
  users: typeof users;
  utils: typeof utils;
  verification: typeof verification;
  verification_node: typeof verification_node;
  violations: typeof violations;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
