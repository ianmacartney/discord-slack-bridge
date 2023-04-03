import {
  httpEndpoint,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import {
  InteractionType,
  InteractionResponseType,
  verifyKey,
} from "discord-interactions";

export const addDiscordMessage = internalMutation(({ db }, msg) => {
  db.insert("discord", msg);
});

export const discordHandler = httpEndpoint(async ({ runMutation }, request) => {
  const bodyText = await request.text();

  // Check signature -- uses discord-interactions package
  const isValidSignature = verifyKey(
    bodyText,
    request.headers.get("X-Signature-Ed25519"),
    request.headers.get("X-Signature-Timestamp"),
    process.env.DISCORD_PUBLIC_KEY
  );
  if (!isValidSignature) {
    return new Response("invalid request signature", { status: 401 });
  }

  const body = JSON.parse(bodyText);
  console.log(body);
  // Handle ping
  if (body.type === InteractionType.PING) {
    return new Response(
      JSON.stringify({ type: InteractionResponseType.PONG }),
      { status: 200 }
    );
  }

  // If it's a message, record it.
  // If it's from a user we don't know, look them up (& store them).
  // From scheduled action?
  // Look up the associated slack thread.
  // Send it to slack.

  await runMutation("discord:addDiscordMessage", body);
  return new Response(null, {
    status: 200,
  });
});

export const saveOauth = mutation(async ({ db }, data) => {
  await db.insert("discord_oauth", data);
  const existing = await db
    .query("discord_users")
    .filter((q) => q.eq(q.field("username"), data.user.username))
    .unique();
  if (!existing) {
    await db.insert("discord_users", data.user);
  }
});

export const latestAccessToken = query(async ({ db }) => {
  return db.query("discord_oauth").order("desc").first();
});

export const discordOauth2 = httpEndpoint(
  async ({ runAction, runMutation }, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const guildId = url.searchParams.get("guild_id");
    console.log({ code, guildId });
    const resp = await runAction("actions/discord:exchangeCode", { code });
    if (!resp.access_token) {
      return new Response(JSON.stringify(resp), {
        status: 400,
        "Content-Type": "application/json",
      });
    }
    await runMutation("discord:saveOauth", resp);
    return new Response("Success", { status: 200 });
  }
);

const a = {
  _exists: {
    _table: { schema: "public", name: "product" },
    _where: {
      _and: [
        { id: { _ceq: ["product_id"] } },
        { orders: { order: { user_id: { _eq: "X-Hasura-User-Id" } } } },
      ],
    },
  },
};
