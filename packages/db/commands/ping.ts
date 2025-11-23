import { createSlashCommand } from "../shared/discordUtils.js";

export const pingCommand = createSlashCommand({
  data: {
    name: "ping",
    description: "Replies with Pong!",
  },
  execute: async (interaction) => {
    const startTime = Date.now();

    await interaction.deferReply();

    const responseTime = Date.now() - startTime;
    const wsPing = interaction.client.ws.ping;

    await interaction.reply(`🏓 Pong! Response: ${responseTime}ms | WebSocket: ${wsPing}ms`);
  },
});