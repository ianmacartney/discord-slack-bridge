"use node";
import { Client, GatewayIntentBits } from "discord.js";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";

const discordClient = async () => {
  const bot = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });
  const token = process.env.VERIFICATION_DISCORD_TOKEN;
  if (!token) throw new Error("Specify discord DISCORD_TOKEN in the dashboard");
  await bot.login(token);
  return bot;
};

function getEnvIds() {
  const guildId = process.env.VERIFICATION_GUILD_ID;
  if (!guildId) throw new Error(`Guild ID not configured`);

  const roleId = process.env.VERIFICATION_ROLE_ID;
  if (!roleId) throw new Error(`Verified role ID not configured`);

  return { guildId, roleId };
}

export const addRole = internalAction({
  args: {
    discordUserId: v.string(),
  },
  handler: async (_ctx, { discordUserId }) => {
    const bot = await discordClient();
    const { guildId, roleId } = getEnvIds();

    const guild = await bot.guilds.fetch(guildId);
    if (!guild) throw new Error(`Can’t find guild ${guildId}`);

    try {
      const member = await guild.members.fetch(discordUserId);
      await member.roles.add(roleId);
    } catch (e) {
      console.warn(e);
    }
  },
});

export const removeRole = internalAction({
  args: {
    discordUserId: v.string(),
  },
  handler: async (_ctx, { discordUserId }) => {
    const bot = await discordClient();
    const { guildId, roleId } = getEnvIds();

    const guild = await bot.guilds.fetch(guildId);
    if (!guild) throw new Error(`Can’t find guild ${guildId}`);

    try {
      const member = await guild.members.fetch(discordUserId);
      await member.roles.remove(roleId);
    } catch (e) {
      console.warn(e);
    }
  },
});
