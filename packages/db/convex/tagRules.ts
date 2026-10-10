import { ConvexError, v } from "convex/values";
import { DatabaseReader, internalQuery } from "./_generated/server";
import { apiMutation, apiQuery } from "./apiFunctions";
import { normalize } from "./tagDefinitions";

export const MAX_TAG_NAME = 20; // Discord's limit for a forum tag name
const MAX_WHEN = 300;
const MAX_RULES = 40;

const rule = v.object({ tag: v.string(), when: v.string() });

export async function loadRules(db: DatabaseReader, guildId: string | null) {
  const rows = guildId
    ? await db
        .query("tagRules")
        .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
        .take(MAX_RULES)
    : [];
  const result: Record<string, { tag: string; when: string }> = {};
  for (const row of rows) {
    if (!row.removed)
      result[normalize(row.tag)] = { tag: row.tag, when: row.when };
  }
  return result;
}

export const forGuild = internalQuery({
  args: { guildId: v.union(v.string(), v.null()) },
  returns: v.record(v.string(), rule),
  handler: async ({ db }, { guildId }) => await loadRules(db, guildId),
});

export const list = apiQuery({
  args: { guildId: v.string() },
  returns: v.array(rule),
  handler: async ({ db }, { guildId }) =>
    Object.values(await loadRules(db, guildId)),
});

export const save = apiMutation({
  args: {
    guildId: v.string(),
    name: v.string(),
    newName: v.optional(v.string()),
    when: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async ({ db }, { guildId, name, newName, when }) => {
    const rows = await db
      .query("tagRules")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .take(MAX_RULES);
    const row = rows.find((r) => normalize(r.tag) === normalize(name));
    if (!row && !when) return null;
    const tag = (newName ?? name).trim();
    const text = (when ?? row?.when ?? "").trim();
    if (!tag || tag.length > MAX_TAG_NAME)
      throw new ConvexError(`Tag names are 1 to ${MAX_TAG_NAME} characters.`);
    if (!normalize(tag))
      throw new ConvexError("The name needs letters or numbers.");
    if (!text || text.length > MAX_WHEN)
      throw new ConvexError(
        `The description must be 1 to ${MAX_WHEN} characters.`,
      );
    const clash = rows.find(
      (r) => r !== row && normalize(r.tag) === normalize(tag),
    );
    if (clash)
      throw new ConvexError(`There is already a description for "${tag}".`);
    if (row) {
      await db.patch("tagRules", row._id, {
        key: normalize(tag),
        tag,
        when: text,
        removed: false,
      });
    } else {
      if (rows.length >= MAX_RULES)
        throw new ConvexError(`At most ${MAX_RULES} descriptions per server.`);
      await db.insert("tagRules", {
        guildId,
        key: normalize(tag),
        tag,
        when: text,
      });
    }
    return null;
  },
});

export const remove = apiMutation({
  args: { guildId: v.string(), name: v.string() },
  returns: v.boolean(),
  handler: async ({ db }, { guildId, name }) => {
    const row = await db
      .query("tagRules")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .take(MAX_RULES)
      .then((all) => all.find((r) => normalize(r.tag) === normalize(name)));
    if (row) await db.delete("tagRules", row._id);
    return !!row;
  },
});
