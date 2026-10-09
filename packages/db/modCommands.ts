// Moderator commands typed as a reply to someone's message:
//   !ban r="reason" d=7       ban the author; d = days of their recent messages to delete (0 to 7)
//   !timeout r="reason" t=1h  time the author out; t like 10m, 1h, 2d (up to 28 days)
// r is optional everywhere. The command message is deleted and the result shows up in the mod channel.
import type { ConvexHttpClient } from "convex/browser";
import { Message, PermissionFlagsBits as P } from "discord.js";
import { api } from "./convex/_generated/api.js";

const MAX_DELETE_DAYS = 7;
const DEFAULT_TIMEOUT_MINUTES = 60;
const MAX_TIMEOUT_MINUTES = 28 * 24 * 60; // Discord's limit
const UNIT_MINUTES: Record<string, number> = { m: 1, h: 60, d: 24 * 60 };

/** `r="..."` with straight or curly quotes. */
export const parseReason = (text: string, fallback: string) =>
  text.match(/r=["“”']([^"“”']*)["“”']/)?.[1]?.trim() || fallback;

export const parseDeleteDays = (text: string) =>
  Math.min(
    Math.max(Number(text.match(/d=(\d+)/)?.[1] ?? 0), 0),
    MAX_DELETE_DAYS,
  );

/** `t=30m`, `t=1h`, `t=2d`; a bare number means minutes. Defaults to an hour, capped at 28 days. */
export function parseTimeoutMinutes(text: string) {
  const match = text.match(/t=(\d+)\s*([mhd]?)/i);
  if (!match) return DEFAULT_TIMEOUT_MINUTES;
  const minutes =
    Number(match[1]) * UNIT_MINUTES[match[2].toLowerCase() || "m"];
  return Math.min(Math.max(minutes, 1), MAX_TIMEOUT_MINUTES);
}

const COMMANDS = {
  ban: { permission: P.BanMembers, defaultReason: "Banned by a moderator" },
  timeout: {
    permission: P.ModerateMembers,
    defaultReason: "Timed out by a moderator",
  },
} as const;

/** Returns true when the message was a !ban or !timeout command, handled or ignored. */
export async function handleModText(
  msg: Message,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const text = msg.content.trim();
  const name = text.match(/^!(ban|timeout)(\s|$)/i)?.[1]?.toLowerCase() as
    | keyof typeof COMMANDS
    | undefined;
  if (!name) return false;
  const command = COMMANDS[name];
  if (!msg.guildId || !msg.reference?.messageId) return true;
  if (!msg.member?.permissions.has(command.permission)) return true;

  try {
    const target = await msg.fetchReference();
    await convex.mutation(api.moderation.actFromChat, {
      action: name,
      targetDiscordUserId: target.author.id,
      channelId: target.channelId,
      discordMessageId: target.id,
      reason: parseReason(text, command.defaultReason),
      ...(name === "ban"
        ? { deleteMessageDays: parseDeleteDays(text) }
        : { durationMinutes: parseTimeoutMinutes(text) }),
      decidedBy: msg.author.id,
      apiToken,
    });
    // The result (done, dry run, or skipped by a safety check) is posted in the mod channel.
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
