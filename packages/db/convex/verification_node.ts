"use node";
import { Routes } from "discord.js";
import { internalAction, env } from "./_generated/server";
import { v } from "convex/values";
import { discordRest } from "./discord_node";

const verificationRest = () => discordRest(env.VERIFICATION_DISCORD_TOKEN);

function getEnvIds() {
  const guildId = env.VERIFICATION_GUILD_ID;
  if (!guildId) throw new Error(`Guild ID not configured`);

  const roleId = env.VERIFICATION_ROLE_ID;
  if (!roleId) throw new Error(`Verified role ID not configured`);

  return { guildId, roleId };
}

function logVerificationError(
  operation: string,
  context: Record<string, string>,
  error: unknown,
) {
  console.error(`[verification] ${operation} failed`, {
    ...context,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

export const addRole = internalAction({
  args: {
    discordUserId: v.string(),
  },
  handler: async (_ctx, { discordUserId }) => {
    const rest = verificationRest();
    const { guildId, roleId } = getEnvIds();

    try {
      await rest.put(Routes.guildMemberRole(guildId, discordUserId, roleId));
      console.log("[verification] addRole succeeded", {
        discordUserId,
        guildId,
        roleId,
      });
    } catch (e) {
      logVerificationError("addRole", { discordUserId, guildId, roleId }, e);
      throw e;
    }
  },
});

export const removeRole = internalAction({
  args: {
    discordUserId: v.string(),
  },
  handler: async (_ctx, { discordUserId }) => {
    const rest = verificationRest();
    const { guildId, roleId } = getEnvIds();

    try {
      await rest.delete(Routes.guildMemberRole(guildId, discordUserId, roleId));
      console.log("[verification] removeRole succeeded", {
        discordUserId,
        guildId,
        roleId,
      });
    } catch (e) {
      logVerificationError("removeRole", { discordUserId, guildId, roleId }, e);
      throw e;
    }
  },
});
