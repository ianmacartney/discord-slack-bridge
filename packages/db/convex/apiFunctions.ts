import {
  customAction,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { action, mutation, query, env } from "./_generated/server";
import { v } from "convex/values";

export const apiQuery = customQuery(query, {
  args: {
    apiToken: v.string(),
  },
  input: async (_ctx, args) => {
    if (args.apiToken !== env.CONVEX_API_TOKEN) {
      throw new Error("Invalid API Token");
    }
    return { ctx: {}, args: {} };
  },
});

export const apiMutation = customMutation(mutation, {
  args: {
    apiToken: v.string(),
  },
  input: async (_ctx, args) => {
    // What is this for?
    if (args.apiToken !== env.CONVEX_API_TOKEN) {
      throw new Error("Invalid API Token");
    }
    return { ctx: {}, args: {} };
  },
});

export const apiAction = customAction(action, {
  args: {
    apiToken: v.string(),
  },
  input: async (_ctx, args) => {
    if (args.apiToken !== env.CONVEX_API_TOKEN) {
      throw new Error("Invalid API Token");
    }
    return { ctx: {}, args: {} };
  },
});
