// https://discordjs.guide/message-components/buttons.html#sending-buttons
const { Client } = require("discord.js");
const { GatewayIntentBits } = require("discord.js");
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
await client.login(VERIFICATION_DISCORD_TOKEN); // from dashboard

const {
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
} = require("discord.js");
let button = new ButtonBuilder()
  .setLabel("Verify")
  .setURL("https://dashboard.convex.dev/discord")
  .setStyle(ButtonStyle.Link);

await channel.send({
  content:
    "Please connect your Convex account to your Discord profile to enhance our support. This connection allows us to offer you more efficient assistance and reduce spam.",
  components: [new ActionRowBuilder().addComponents(button)],
});
