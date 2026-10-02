// The auto-tagger's definitions for a server: the built-in ones in tagDefinitions.ts, changed by what moderators did
// with /tags rule. Jev reads `when`, so it should say plainly when the tag applies.
import { ConvexError, v } from "convex/values";
import { DatabaseReader, internalQuery } from "./_generated/server";
import { apiMutation, apiQuery } from "./apiFunctions";
import {
  type Definition,
  normalize,
  POST_AREAS,
  POST_TYPES,
} from "./tagDefinitions";

export const MAX_TAG_NAME = 20; // Discord's limit for a forum tag name
const MAX_WHEN = 300;
const MAX_RULES = 40;

const kindValidator = v.union(v.literal("type"), v.literal("area"));
type Kind = "type" | "area";
const DEFAULTS: Record<Kind, Record<string, Definition>> = {
  type: POST_TYPES,
  area: POST_AREAS,
};

const rule = v.object({
  key: v.string(),
  tag: v.union(v.string(), v.null()),
  when: v.string(),
  // Changed or added by moderators, not the built-in text.
  custom: v.boolean(),
});
const rules = v.object({ type: v.array(rule), area: v.array(rule) });

/** Built-ins plus this server's changes, as the maps Jev chooses from. */
export async function loadDefinitions(
  db: DatabaseReader,
  guildId: string | null,
) {
  const rows = guildId
    ? await db
        .query("tagRules")
        .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
        .take(MAX_RULES * 2)
    : [];
  const result: Record<
    Kind,
    Record<string, Definition & { custom: boolean }>
  > = {
    type: {},
    area: {},
  };
  for (const kind of ["type", "area"] as const) {
    for (const [key, d] of Object.entries(DEFAULTS[kind])) {
      result[kind][key] = { ...d, custom: false };
    }
  }
  for (const row of rows) {
    if (row.removed) delete result[row.kind][row.key];
    else
      result[row.kind][row.key] = {
        tag: row.tag,
        when: row.when,
        custom: true,
      };
  }
  return result;
}

const toList = (defs: Record<string, Definition & { custom: boolean }>) =>
  Object.entries(defs).map(([key, d]) => ({ key, ...d }));

export const forGuild = internalQuery({
  args: { guildId: v.union(v.string(), v.null()) },
  returns: v.object({
    type: v.record(
      v.string(),
      v.object({
        tag: v.union(v.string(), v.null()),
        when: v.string(),
        custom: v.boolean(),
      }),
    ),
    area: v.record(
      v.string(),
      v.object({
        tag: v.union(v.string(), v.null()),
        when: v.string(),
        custom: v.boolean(),
      }),
    ),
  }),
  handler: async ({ db }, { guildId }) => await loadDefinitions(db, guildId),
});

export const list = apiQuery({
  args: { guildId: v.string() },
  returns: rules,
  handler: async ({ db }, { guildId }) => {
    const defs = await loadDefinitions(db, guildId);
    return { type: toList(defs.type), area: toList(defs.area) };
  },
});

/** Finds a definition by its tag name (ignoring case, emoji and punctuation) or its key. */
function findKey(defs: Record<string, Definition>, name: string) {
  return Object.keys(defs).find(
    (key) =>
      key === name ||
      (defs[key].tag && normalize(defs[key].tag) === normalize(name)),
  );
}

/** Adds a definition, or with an existing tag name changes its tag name and/or description. */
export const save = apiMutation({
  args: {
    guildId: v.string(),
    kind: kindValidator,
    name: v.string(), // the tag to add, or the existing one to change
    newName: v.optional(v.string()),
    when: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async ({ db }, { guildId, kind, name, newName, when }) => {
    const defs = (await loadDefinitions(db, guildId))[kind];
    const key = findKey(defs, name);
    const existing = key ? defs[key] : null;
    const tag = (newName ?? name).trim();
    const text = (when ?? existing?.when ?? "").trim();
    if (!existing && !when)
      throw new ConvexError("A new definition needs a description.");
    if (!tag || tag.length > MAX_TAG_NAME)
      throw new ConvexError(`Tag names are 1 to ${MAX_TAG_NAME} characters.`);
    if (!text || text.length > MAX_WHEN)
      throw new ConvexError(
        `The description must be 1 to ${MAX_WHEN} characters.`,
      );
    if (existing && !existing.tag)
      throw new ConvexError(
        'That is the built-in "not a support post" choice and has no tag.',
      );
    const clash = findKey(defs, tag);
    if (clash && clash !== key)
      throw new ConvexError(`There is already a definition for "${tag}".`);
    const newKey = key ?? normalize(tag);
    if (!newKey) throw new ConvexError("The name needs letters or numbers.");

    const rows = await db
      .query("tagRules")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .take(MAX_RULES * 2);
    if (!key && rows.length >= MAX_RULES)
      throw new ConvexError(`At most ${MAX_RULES} changes per server.`);
    const row = rows.find((r) => r.kind === kind && r.key === newKey);
    if (row)
      await db.patch("tagRules", row._id, { tag, when: text, removed: false });
    else
      await db.insert("tagRules", {
        guildId,
        kind,
        key: newKey,
        tag,
        when: text,
      });
    return key ? "updated" : "added";
  },
});

/** Hides a built-in definition or deletes one the server added. The "not a support post" choice always stays. */
export const remove = apiMutation({
  args: { guildId: v.string(), kind: kindValidator, name: v.string() },
  returns: v.string(),
  handler: async ({ db }, { guildId, kind, name }) => {
    const defs = (await loadDefinitions(db, guildId))[kind];
    const key = findKey(defs, name);
    if (!key) throw new ConvexError(`No definition for "${name}".`);
    if (!defs[key].tag)
      throw new ConvexError("That choice has no tag and always stays.");
    const row = await db
      .query("tagRules")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .take(MAX_RULES * 2)
      .then((all) => all.find((r) => r.kind === kind && r.key === key));
    const builtIn = key in DEFAULTS[kind];
    if (builtIn) {
      const hidden = {
        tag: defs[key].tag!,
        when: defs[key].when,
        removed: true,
      };
      if (row) await db.patch("tagRules", row._id, hidden);
      else await db.insert("tagRules", { guildId, kind, key, ...hidden });
    } else if (row) {
      await db.delete("tagRules", row._id);
    }
    return defs[key].tag!;
  },
});

/** Goes back to the built-in text for one definition (or removes one the server added). */
export const reset = apiMutation({
  args: { guildId: v.string(), kind: kindValidator, name: v.string() },
  returns: v.string(),
  handler: async ({ db }, { guildId, kind, name }) => {
    const rows = await db
      .query("tagRules")
      .withIndex("by_guildId", (q) => q.eq("guildId", guildId))
      .take(MAX_RULES * 2);
    const match = rows.find(
      (r) =>
        r.kind === kind &&
        (r.key === name || normalize(r.tag) === normalize(name)),
    );
    if (!match) throw new ConvexError(`Nothing to reset for "${name}".`);
    await db.delete("tagRules", match._id);
    return match.tag;
  },
});
