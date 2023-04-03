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

  return new Response(null, {
    status: 200,
  });
});
