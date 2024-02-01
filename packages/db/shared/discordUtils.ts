import { Channel, Message, PartialMessage, ThreadChannel } from "discord.js";
import {
  DiscordChannel,
  DiscordMessage,
  DiscordThread,
  DiscordUser,
} from "../convex/schema";

export function serializeThread(discordThread: ThreadChannel): DiscordThread {
  return {
    appliedTags: discordThread.appliedTags,
    archiveTimestamp: discordThread.archiveTimestamp,
    archived: discordThread.archived,
    createdTimestamp: discordThread.createdTimestamp ?? Date.now(),
    flags: discordThread.flags.valueOf(),
    id: discordThread.id,
    invitable: discordThread.invitable,
    name: discordThread.name,
    ownerId: discordThread.ownerId,
    parentId: discordThread.parentId,
    locked: discordThread.locked,
    type: discordThread.type,
  };
}

export function serializeChannel(discordChannel: Channel): DiscordChannel {
  return {
    availableTags:
      "availableTags" in discordChannel
        ? discordChannel.availableTags
        : undefined,
    createdTimestamp: discordChannel.createdTimestamp,
    flags: discordChannel.flags?.valueOf(),
    id: discordChannel.id,
    name: ("name" in discordChannel ? discordChannel.name : null) ?? "unknown",
    parentId: "parentId" in discordChannel ? discordChannel.parentId : null,
    topic: "topic" in discordChannel ? discordChannel.topic : null,
    type: discordChannel.type,
  };
}

export function serializeMessage(msg: Message): DiscordMessage {
  return {
    cleanContent: msg.cleanContent,
    content: msg.content,
    createdTimestamp: msg.createdTimestamp,
    editedTimestamp: msg.editedTimestamp,
    flags: msg.flags.valueOf(),
    id: msg.id,
    pinned: msg.pinned,
    reference: msg.reference,
    system: msg.system,
    type: msg.type,
    json: msg.toJSON(),
  };
}

export function serializePartialMessage(msg: Message | PartialMessage) {
  return {
    cleanContent: msg.cleanContent ?? undefined,
    content: msg.content ?? undefined,
    createdTimestamp: msg.createdTimestamp,
    editedTimestamp: msg.editedTimestamp,
    flags: msg.flags.valueOf(),
    id: msg.id,
    pinned: msg.pinned ?? undefined,
    reference: msg.reference,
    system: msg.system ?? undefined,
    type: msg.type ?? undefined,
  };
}

export function serializeAuthor(msg: Message): DiscordUser {
  return {
    id: msg.author.id, // '897754604790480906',
    // author fields
    bot: msg.author.bot, // false,
    system: msg.author.system, // false,
    username: msg.author.username, // 'ianm',
    discriminator: msg.author.discriminator, // '8678',
    // banner: msg.author.banner, // undefined,
    // accentColor: msg.author.accentColor, // undefined,
    createdTimestamp: msg.author.createdTimestamp, // 1634111777256,
    // hexAccentColor: msg.author.hexAccentColor, // undefined,
    tag: msg.author.tag, // 'ianm#8678',
    // bannerURL: msg.author.bannerURL, // undefined
    // hybrid fields
    flags: msg.member?.flags?.toJSON() || msg.author.flags?.toJSON() || 0, // 0,
    avatarURL:
      msg.member?.displayAvatarURL() ??
      msg.member?.avatarURL() ??
      msg.author.avatarURL() ??
      msg.author.defaultAvatarURL, // 'https://cdn.discordapp.com/avatars/897754604790480906/43f79107277172b0539f3c4be5219b7a.webp',
    displayAvatarURL: msg.member?.displayAvatarURL() ?? null, // 'https://cdn.discordapp.com/avatars/897754604790480906/43f79107277172b0539f3c4be5219b7a.webp',
    // member fields
    memberId: msg.member?.id,
    joinedTimestamp: msg.member?.joinedTimestamp ?? null, // 1663305729175,
    nickname: msg.member?.nickname ?? null, // 'Ian',
    pending: msg.member?.pending, // false,
    displayName: msg.member?.displayName, // 'Ian',
    roles: Array.from(msg.member?.roles.valueOf().keys() ?? []), // [ '1019375583387463710', '1019350475847499849' ],
  };
}
