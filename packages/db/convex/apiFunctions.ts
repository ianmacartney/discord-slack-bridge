import {
  customAction,
  customMutation,
} from "convex-helpers/server/customFunctions";
import { action, mutation } from "./_generated/server";
import { v } from "convex/values";

export const apiMutation = customMutation(mutation, {
  args: {
    apiToken: v.string(),
  },
  input: async (_ctx, args) => {
    if (args.apiToken !== process.env.CONVEX_API_TOKEN) {
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
    if (args.apiToken !== process.env.CONVEX_API_TOKEN) {
      throw new Error("Invalid API Token");
    }
    return { ctx: {}, args: {} };
  },
});
