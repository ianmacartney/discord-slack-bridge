import { Doc, Id } from "./_generated/dataModel";
import {
  DatabaseReader,
  DatabaseWriter,
  mutation,
  query,
} from "./_generated/server";

export type DiscordDocument = {
  objectID: string;
  title: string;
  date: number;
  messages: {
    author: string;
    body: string;
  }[];
  tags: string[];
};

const hydrateSearchDocument = async ({
  db,
  thread,
  tagMap,
}: {
  db: DatabaseReader;
  thread: Doc<"threads">;
  tagMap: TagMap;
}): Promise<DiscordDocument> => {
  // Let's hydrate the tags...
  const chanTags = tagMap.get(thread.channelId.toString())!;
  var tags = [];
  for (const tag of thread.appliedTags) {
    const tagName: string | null = chanTags.get(tag) ?? null;
    if (tagName) {
      tags.push(tagName);
    }
  }
  // Now, let's fetch all the messages.
  var messages: Doc<"messages">[] = await db
    .query("messages")
    .withIndex("threadId", (q) => q.eq("threadId", thread._id))
    .collect();

  // Sort by id / snowflake order, this is the order the messages were said in.
  messages.sort((a, b) => Number(a.id) - Number(b.id));

  // Username resolution with memoization.
  var finalMessages = [];
  for (const message of messages) {
    const authorName = (await db.get(message.authorId))?.displayName ?? "";
    finalMessages.push({
      author: authorName,
      body: message.cleanContent,
    });
  }

  return {
    title: thread.name,
    objectID: thread.id,
    tags,
    messages: finalMessages,
    date: thread.createdTimestamp,
  };
};

type TagMap = Map<string, Map<string, string>>;

const resolveTags = async ({ db }: { db: DatabaseReader }): Promise<TagMap> => {
  // Resolve tags.
  const channels = await db.query("channels").collect();
  const tagMap = new Map();
  for (const c of channels) {
    const chanMap = new Map();
    for (const t of c.availableTags ?? []) {
      chanMap.set(t.id, t.name);
    }
    tagMap.set(c._id.toString(), chanMap);
  }
  return tagMap;
};

export const updatedSearchDocuments = query(
  async ({
    db,
  }: {
    db: DatabaseReader;
  }): Promise<{ documents: DiscordDocument[]; position: number | null }> => {
    // Grab the cursor for the last synced discord thread document.
    const currentCursor =
      (await db.query("threadSearchStatus").first())?.indexedCursor ?? 0;
    const newThreadBatch: Doc<"threads">[] = await db
      .query("threads")
      .withIndex("version", (q) => q.gt("version", currentCursor))
      .order("asc")
      .take(10);
    if (newThreadBatch.length == 0) {
      return { documents: [], position: null };
    }

    const tagMap = await resolveTags({ db });
    var hydratedBatch = [];
    for (const thread of newThreadBatch) {
      hydratedBatch.push(await hydrateSearchDocument({ db, thread, tagMap }));
    }
    return {
      documents: hydratedBatch,
      position: newThreadBatch[newThreadBatch.length - 1].version!,
    };
  }
);

export const setSearchIndex = mutation(
  async (
    { db }: { db: DatabaseWriter },
    { position }: { position: number }
  ): Promise<void> => {
    const existing = await db.query("threadSearchStatus").first();
    if (existing == null) {
      await db.insert("threadSearchStatus", { indexedCursor: position });
    } else {
      await db.patch(existing._id, { indexedCursor: position });
    }
  }
);
