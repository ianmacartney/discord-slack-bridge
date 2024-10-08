/* prettier-ignore-start */

/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as algolia from "../algolia.js";
import type * as apiFunctions from "../apiFunctions.js";
import type * as crons from "../crons.js";
import type * as discord from "../discord.js";
import type * as discord_node from "../discord_node.js";
import type * as http from "../http.js";
import type * as indexing from "../indexing.js";
import type * as migrations from "../migrations.js";
import type * as slack from "../slack.js";
import type * as slack_node from "../slack_node.js";
import type * as tickets from "../tickets.js";
import type * as users from "../users.js";
import type * as utils from "../utils.js";
import type * as verification from "../verification.js";
import type * as verification_node from "../verification_node.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  algolia: typeof algolia;
  apiFunctions: typeof apiFunctions;
  crons: typeof crons;
  discord: typeof discord;
  discord_node: typeof discord_node;
  http: typeof http;
  indexing: typeof indexing;
  migrations: typeof migrations;
  slack: typeof slack;
  slack_node: typeof slack_node;
  tickets: typeof tickets;
  users: typeof users;
  utils: typeof utils;
  verification: typeof verification;
  verification_node: typeof verification_node;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

/* prettier-ignore-end */
