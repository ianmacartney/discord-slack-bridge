import { ApplicationCommandType, Events } from "discord.js";
import { createEvent } from "../shared/discordUtils.js";
import { commands } from "../commands/index.js";


export const interactionCreateEvent = createEvent(
  {
    name: Events.InteractionCreate,
  },
  async (interaction) => {
    if (
      !interaction.isChatInputCommand() &&
      !interaction.isMessageContextMenuCommand() &&
      !interaction.isUserContextMenuCommand()
    ) {
      return;
    }

    const command = commands.get(interaction.commandName);

    if (command === undefined) {
      throw new Error(`Command ${interaction.commandName} not found`);
    }

    // Execute based on command type and verify interaction type matches
    if (command.commandType === ApplicationCommandType.ChatInput) {
      if (!interaction.isChatInputCommand()) {
        throw new Error("Command type mismatch: expected ChatInput interaction");
      }
      await command.execute(interaction);
    } else if (command.commandType === ApplicationCommandType.Message) {
      if (!interaction.isMessageContextMenuCommand()) {
        throw new Error("Command type mismatch: expected Message context menu interaction");
      }
      // await command.execute(interaction);
    } else if (command.commandType === ApplicationCommandType.User) {
      if (!interaction.isUserContextMenuCommand()) {
        throw new Error("Command type mismatch: expected User context menu interaction");
      }
      // await command.execute(interaction);
    }
  }
);