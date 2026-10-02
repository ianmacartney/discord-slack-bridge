// Confidence cut-offs that moderators change with /confidence. Stored bot-wide in the thresholds table.
import { v } from "convex/values";
import { DatabaseReader, internalQuery } from "./_generated/server";
import { apiMutation, apiQuery } from "./apiFunctions";
import { THRESHOLD_DEFAULTS, ThresholdName } from "./violations";

// Below 0.5 Jev is barely better than a guess, and these cut-offs delete messages and time people out.
export const MIN_THRESHOLD = 0.5;

/** Every threshold: its default, overridden by whatever a moderator set. */
export async function loadThresholds(db: DatabaseReader) {
  const result: Record<ThresholdName, number> = { ...THRESHOLD_DEFAULTS };
  for (const row of await db.query("thresholds").take(50)) {
    if (row.name in result) result[row.name as ThresholdName] = row.value;
  }
  return result;
}

const thresholds = v.record(v.string(), v.number());

export const all = internalQuery({
  args: {},
  returns: thresholds,
  handler: async ({ db }) => await loadThresholds(db),
});

export const get = apiQuery({
  args: {},
  returns: thresholds,
  handler: async ({ db }) => await loadThresholds(db),
});

/** `value: null` goes back to the default. The bot also validates this, but the server is the one that must hold. */
export const set = apiMutation({
  args: { name: v.string(), value: v.union(v.number(), v.null()) },
  returns: v.null(),
  handler: async ({ db }, { name, value }) => {
    if (!(name in THRESHOLD_DEFAULTS)) throw new Error(`Unknown threshold ${name}`);
    if (value !== null && !(value >= MIN_THRESHOLD && value <= 1)) {
      throw new Error(`Value must be between ${MIN_THRESHOLD} and 1`);
    }
    const row = await db
      .query("thresholds")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (value === null) {
      if (row) await db.delete("thresholds", row._id);
    } else if (row) {
      await db.patch("thresholds", row._id, { value });
    } else {
      await db.insert("thresholds", { name, value });
    }
    return null;
  },
});
