import {
  httpEndpoint,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";

const upsert = (db, table, doc, primaryKey = "id") => {
  const existing = db
    .query(table)
    .filter((q) => q.eq(q.field(primaryKey), doc[primaryKey]))
    .unique();
  if (!existing) {
    return db.insert(table, doc);
  } else {
    return db.replace(existing, doc);
  }
};

export const addDiscordMessage = mutation(
  ({ db }, { message, author, member, channels }) => {
    upsert(db, "discordMessage", message);
    upsert(db, "discordUser", author);
    upsert(db, "discordMember", author);
    db.insert("discordMessage", message);
  }
);
