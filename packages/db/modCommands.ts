import type { ConvexHttpClient } from "convex/browser";
import { Message, PermissionFlagsBits as P } from "discord.js";
import { api } from "./convex/_generated/api.js";

const COMMANDS = {
  ban: P.BanMembers,
  timeout: P.ModerateMembers,
  kick: P.KickMembers,
} as const;

export const parseCommand = (text: string) => {
  const match = text.trim().match(/^!(ban|timeout|kick)\b\s*\??\s*([\s\S]*)$/i);
  if (!match) return null;
  return {
    name: match[1].toLowerCase() as keyof typeof COMMANDS,
    reason: match[2].trim() || null,
  };
};

export async function handleModText(
  msg: Message,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const command = parseCommand(msg.content);
  if (!command) return false;
  if (!msg.guildId || !msg.reference?.messageId) return true;
  if (!msg.member?.permissions.has(COMMANDS[command.name])) return true;

  try {
    const target = await msg.fetchReference();
    await convex.mutation(api.moderation.actFromChat, {
      action: command.name,
      targetDiscordUserId: target.author.id,
      channelId: target.channelId,
      discordMessageId: target.id,
      reason: command.reason ?? undefined,
      decidedBy: msg.author.id,
      apiToken,
    });
    await msg.delete().catch(() => {});
  } catch (e) {
    console.error(e);
    await msg.reply({
      content: "Something went wrong. Check the bot logs.",
      allowedMentions: { repliedUser: false },
    });
  }
  return true;
}
