import type {
  ChatInputApplicationCommandData,
  ChatInputCommandInteraction,
  Client,
  CommandInteraction,
  Guild,
} from 'discord.js';

export type CommandDataWithHandler = ChatInputApplicationCommandData & {
  handler: (client: Client, interaction: ChatInputCommandInteraction) => Promise<void>;
  onAttach?: (client: Client) => void;
  guildValidate?: (guild: Guild) => boolean;
};

export type DiscordEvent<T extends keyof ClientEvents = keyof ClientEvents> = {
  name: T;
  once?: boolean;
  execute: (...args: ClientEvents[T]) => Promise<void> | void;
};

export type UserContextMenuCommand = {
  commandType: ApplicationCommandType.User;
  data: RESTPostAPIContextMenuApplicationCommandsJSONBody;
  execute: (interaction: UserContextMenuCommandInteraction) => Promise<void> | void;
};

export type MessageContextMenuCommand = {
  commandType: ApplicationCommandType.Message;
  data: RESTPostAPIContextMenuApplicationCommandsJSONBody;
  execute: (interaction: MessageContextMenuCommandInteraction) => Promise<void> | void;
};

export type SlashCommand = {
  commandType: ApplicationCommandType.ChatInput;
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void> | void;
};

export type Command = SlashCommand | UserContextMenuCommand | MessageContextMenuCommand;

export type CommandInteraction =
  | ChatInputCommandInteraction
  | MessageContextMenuCommandInteraction
  | UserContextMenuCommandInteraction;