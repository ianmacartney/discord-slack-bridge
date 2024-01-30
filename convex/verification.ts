import { internal } from "./_generated/api";
import {
  internalMutation,
  DatabaseWriter,
  httpAction,
  action,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";

export const registerAccountHandler = httpAction(
  async ({ runAction, runMutation }, request) => {
    authorizeWebhookRequest(request);
    const { associatedAccountId, discordId } = JSON.parse(await request.text());

    // Add the role

    await runAction(internal.verification_node.addRole, {
      discordUserId: discordId,
    });

    await runMutation(internal.verification.insertRegistration, {
      discordUserId: discordId,
      associatedAccountId,
    });

    return new Response();
  }
);

export const unregisterAccountHandler = httpAction(
  async ({ runAction, runMutation }, request) => {
    authorizeWebhookRequest(request);
    const { discordId } = JSON.parse(await request.text());

    await runAction(internal.verification_node.removeRole, {
      discordUserId: discordId,
    });

    await runMutation(internal.verification.deleteRegistration, {
      discordUserId: discordId,
    });

    return new Response();
  }
);

function authorizeWebhookRequest(request: Request) {
  const webhookToken = process.env.VERIFICATION_WEBHOOK_TOKEN;
  if (!webhookToken) {
    throw new Error("Token for webhook requests not set");
  }

  if (request.headers.get("Authorization") !== `Bearer ${webhookToken}`) {
    throw new Error("Token for webhook requests invalid");
  }
}

export const insertRegistration = internalMutation({
  args: {
    discordUserId: v.string(),
    associatedAccountId: v.string(),
  },
  handler: async ({ db }, { discordUserId, associatedAccountId }) => {
    await deleteRegistrations(db, discordUserId);
    await db.insert("registrations", { discordUserId, associatedAccountId });
  },
});

export const deleteRegistration = internalMutation({
  args: {
    discordUserId: v.string(),
  },
  handler: async ({ db }, { discordUserId }) => {
    await deleteRegistrations(db, discordUserId);
  },
});

async function deleteRegistrations(db: DatabaseWriter, discordUserId: string) {
  const existingRows = await db
    .query("registrations")
    .withIndex("discordUserId", (q) => q.eq("discordUserId", discordUserId))
    .collect();
  for (const { _id } of existingRows) {
    await db.delete(_id);
  }
}

export const isAccountLinked = internalQuery({
  args: {
    discordUserId: v.string(),
  },
  handler: async ({ db }, { discordUserId }) => {
    const registration = await db
      .query("registrations")
      .withIndex("discordUserId", (q) => q.eq("discordUserId", discordUserId))
      .first();
    return registration !== null;
  },
});

export const addRoleIfAccountLinked = action({
  args: {
    discordUserId: v.string(),
  },
  handler: async ({ runQuery, runAction }, { discordUserId }) => {
    const isAccountLinked = await runQuery(
      internal.verification.isAccountLinked,
      { discordUserId }
    );

    if (isAccountLinked) {
      await runAction(internal.verification_node.addRole, {
        discordUserId,
      });
    }
  },
});
