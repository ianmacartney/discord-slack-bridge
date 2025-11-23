import { Client } from "discord.js";
import { pingCommand } from "./ping.js";
import { Command } from "../types.js";

export const commands = new Map<string, Command>(
  [pingCommand]
    .flat()
    .map((cmd) => [cmd.data.name, cmd])
);

export const registerCommands = async (
  client: Client,
  commands: Map<string, Command>
): Promise<void> => {
  const commandArray = Array.from(commands.values()).map((cmd) => cmd.data);
  try {
    await client.application?.commands.set(commandArray);
    commandArray.forEach((cmd) => {
      console.log(`Registered command: ${cmd.type}, ${cmd.name}`);
    });
    console.log(`Registered ${commandArray.length} commands globally.`);
  } catch (error) {
    console.error('Error registering commands:', error);
  }
};