import { ApplicationCommandType, Channel, CommandInteraction, Message, PartialMessage, PermissionsBitField, ThreadChannel } from "discord.js";
import {
  DiscordChannel,
  DiscordMessage,
  DiscordThread,
  DiscordUser,
} from "../convex/schema";

import type { Client, ClientEvents } from 'discord.js';
import { Command, DiscordEvent, SlashCommand } from "../types";

export function serializeThread(discordThread: ThreadChannel): DiscordThread {
  return {
    appliedTags: discordThread.appliedTags,
    archiveTimestamp: discordThread.archiveTimestamp,
    archived: discordThread.archived,
    createdTimestamp: discordThread.createdTimestamp ?? Date.now(),
    flags: discordThread.flags.valueOf(),
    guildId: discordThread.guildId,
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

export const isAuthorizedToUseCommands = (interaction: CommandInteraction) => {
  if (!interaction.inGuild()) return false;
  if (!interaction.member) {
    return false;
  }
  if ((interaction.member.permissions as PermissionsBitField).has(PermissionsBitField.Flags.Administrator)) {
    return true
  } else {
    return false
  }
}

export function asyncCatch<T extends readonly unknown[], K>(
  fn: (...args: T) => Promise<K>
): (...args: T) => Promise<K> {
  return async (...args: T): Promise<K> => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error(error);
      throw error;
    }
  };
}

export const createCommand = (command: Command): Command => {
  return command;
};

export const createCommands = (commands: Array<Command>): Command[] => {
  return commands.map(createCommand);
};



export const createEvent = <T extends keyof ClientEvents = keyof ClientEvents>(
  data: {
    name: T;
    once?: boolean;
  },
  execute: (...args: ClientEvents[T]) => Promise<void> | void
): DiscordEvent<T> => {
  return { ...data, execute };
};

export const createEvents = <T extends keyof ClientEvents = keyof ClientEvents>(
  events: Array<{
    data: {
      name: T;
      once?: boolean;
    };
    execute: (...args: ClientEvents[T]) => Promise<void> | void;
  }>
): DiscordEvent<T>[] => {
  return events.map(({ data, execute }) => createEvent(data, execute));
};

export const registerEvents = async (client: Client, events: DiscordEvent[]): Promise<void> => {
  for (const event of events) {
    console.log(`Loading event: ${String(event.name)}`);
    client[event.once ? 'once' : 'on'](String(event.name), async (...args) => {
      try {
        await event.execute(...args);
      } catch (error) {
        console.error(`Error executing event ${String(event.name)}:`, error);
      }
    });
  }
};

export const createSlashCommand = (command: {
  data: Omit<SlashCommand["data"], "type">;
  execute: SlashCommand["execute"];
}): SlashCommand => {
  return {
    commandType: ApplicationCommandType.ChatInput,
    data: {
      ...command.data,
      type: ApplicationCommandType.ChatInput,
    },
    execute: command.execute,
  };
};
