import { Doc } from "./_generated/dataModel";
import {
  DatabaseReader,
  DatabaseWriter,
  mutation,
  query,
} from "./_generated/server";

const CONVEXER_ROLE = "1019375583387463710";

// Algolia record size limit is 10KB. Leave a small margin for safety.
const ALGOLIA_MAX_RECORD_BYTES = 9_500;
const MAX_MESSAGE_BODY_LENGTH = 250;

const recordBytes = (doc: DiscordDocument) =>
  new TextEncoder().encode(JSON.stringify(doc)).length;

export type DiscordDocument = {
  objectID: string;
  title: string;
  date: number;
  channel: string;
  url: string;
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

  // Get the actual channel object to access the Discord channel ID.
  const channel = await db.get(thread.channelId);
  if (!channel) {
    return null;
  }

  const tags = [];
  for (const tag of thread.appliedTags) {
    const tagName: string | null = chan.tagMap.get(tag) ?? null;
    if (tagName) {
      tags.push(tagName);
    }
  }
  const messages: Doc<"messages">[] = await db
    .query("messages")
    .withIndex("threadId", (q) => q.eq("threadId", thread._id))
    .collect();

  messages.sort((a, b) => Number(a.id) - Number(b.id));

  const finalMessages = [];
  for (const message of messages) {
    const author = (await db.get(message.authorId))!;
    finalMessages.push({
      author: {
        name: author.displayName ?? "",
        avatar: author.displayAvatarURL ?? "",
        convexer: author.roles.includes(CONVEXER_ROLE),
      },
      body: message.cleanContent,
    });
  }

  const doc: DiscordDocument = {
    title: thread.name,
    objectID: thread.id,
    channel: chan.name,
    url: `https://discord.com/channels/${thread.guildId}/${thread.id}`,
    tags,
    messages: finalMessages,
    date: thread.createdTimestamp,
  };

  // Progressive truncation to fit Algolia's 10KB record limit.
  const degradations: string[] = [];

  // Phase 1: truncate long message bodies.
  if (recordBytes(doc) > ALGOLIA_MAX_RECORD_BYTES) {
    let truncated = 0;
    for (const msg of doc.messages) {
      if (msg.body.length > MAX_MESSAGE_BODY_LENGTH) {
        msg.body = msg.body.slice(0, MAX_MESSAGE_BODY_LENGTH) + "…";
        truncated++;
      }
    }
    if (truncated > 0) {
      degradations.push(
        `truncated ${truncated} message bodies to ${MAX_MESSAGE_BODY_LENGTH} chars`,
      );
    }
  }

  // Phase 2: drop oldest messages (keep the thread starter at index 0).
  if (recordBytes(doc) > ALGOLIA_MAX_RECORD_BYTES && doc.messages.length > 1) {
    const before = doc.messages.length;
    while (
      recordBytes(doc) > ALGOLIA_MAX_RECORD_BYTES &&
      doc.messages.length > 1
    ) {
      doc.messages.splice(1, 1);
    }
    degradations.push(
      `dropped ${before - doc.messages.length} of ${before} messages`,
    );
  }

  if (degradations.length > 0) {
    console.warn(
      `[Algolia] Record degraded for ${doc.objectID} (${doc.channel}): ${degradations.join("; ")} [${recordBytes(doc)}B]`,
    );
  }

  return doc;
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
  }): Promise<{ documents: string; position: number | null }> => {
    const currentCursor =
      (await db.query("threadSearchStatus").first())?.indexedCursor ?? 0;
    const newThreadBatch: Doc<"threads">[] = await db
      .query("threads")
      .withIndex("version", (q) => q.gt("version", currentCursor))
      .order("asc")
      .take(10);
    if (newThreadBatch.length == 0) {
      return { documents: "[]", position: null };
    }

    const chanInfo = await getChanInfo({ db });
    const hydratedBatch = [];
    for (const thread of newThreadBatch) {
      const hyDoc = await hydrateSearchDocument({ db, thread, chanInfo });
      if (hyDoc) {
        hydratedBatch.push(hyDoc);
      }
    }
    // Serialize here so Convex's transport doesn't have to handle
    // exotic unicode in message content (lone surrogates, etc.).
    return {
      documents: JSON.stringify(hydratedBatch),
      position: newThreadBatch[newThreadBatch.length - 1].version!,
    };
  },
);

export const setSearchIndex = mutation(
  async (
    { db }: { db: DatabaseWriter },
    { position }: { position: number },
  ): Promise<void> => {
    const existing = await db.query("threadSearchStatus").first();
    if (existing == null) {
      await db.insert("threadSearchStatus", { indexedCursor: position });
    } else {
      await db.patch(existing._id, { indexedCursor: position });
    }
  },
);
