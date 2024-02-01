import { Doc } from "./_generated/dataModel";
import {
  DatabaseReader,
  DatabaseWriter,
  mutation,
  query,
} from "./_generated/server";

const CONVEXER_ROLE = "1019375583387463710";

export type DiscordDocument = {
  objectID: string;
  title: string;
  date: number;
  channel: string;
  messages: {
    author: {
      name: string;
      avatar: string;
      convexer: boolean;
    };
    body: string;
  }[];
  tags: string[];
};

const hydrateSearchDocument = async ({
  db,
  thread,
  chanInfo,
}: {
  db: DatabaseReader;
  thread: Doc<"threads">;
  chanInfo: ChanInfo;
}): Promise<DiscordDocument | null> => {
  // Let's hydrate the tags...
  const chan = chanInfo.get(thread.channelId.toString())!;
  if (!chan.include) {
    return null; // This channel is not being indexed for search.
  }
  var tags = [];
  for (const tag of thread.appliedTags) {
    const tagName: string | null = chan.tagMap.get(tag) ?? null;
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
    const author = (await db.get(message.authorId))!;
    const authorName = author.displayName ?? "";
    const avatarUrl = author.displayAvatarURL ?? "";
    const convexer = author.roles.includes(CONVEXER_ROLE);
    finalMessages.push({
      author: {
        name: authorName,
        avatar: avatarUrl,
        convexer,
      },
      body: message.cleanContent,
    });
  }

  return {
    title: thread.name,
    objectID: thread.id,
    channel: chan.name,
    tags,
    messages: finalMessages,
    date: thread.createdTimestamp,
  };
};

type ChanInfo = Map<
  string,
  { include: boolean; tagMap: Map<string, string>; name: string }
>;

const getChanInfo = async ({
  db,
}: {
  db: DatabaseReader;
}): Promise<ChanInfo> => {
  // Resolve tags.
  const channels = await db.query("channels").collect();
  const tagMap = new Map();
  for (const c of channels) {
    const chanMap = new Map();
    for (const t of c.availableTags ?? []) {
      chanMap.set(t.id, t.name);
    }
    tagMap.set(c._id.toString(), {
      tagMap: chanMap,
      name: c.name,
      include: c.indexForSearch ?? false,
    });
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

    const chanInfo = await getChanInfo({ db });
    var hydratedBatch = [];
    for (const thread of newThreadBatch) {
      const hyDoc = await hydrateSearchDocument({ db, thread, chanInfo });
      if (hyDoc) {
        hydratedBatch.push(hyDoc);
      }
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
