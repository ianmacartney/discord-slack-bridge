const { Client } = require("discord.js");
const { GatewayIntentBits } = require("discord.js");
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});
await client.login(VERIFICATION_DISCORD_TOKEN); // from dashboard

const guild = await client.guilds.fetch("1019350475847499849");
const members = await guild.members.fetch();
let n = 0;
for (const [k, m] of members.entries()) {
  if (!m.roles) {
    console.log("missing for", k);
    break;
  }
  if (m.roles.cache.has("1204186087933607936")) continue;
  await m.roles.add("1204186087933607936");
  n += 1;
}

console.log("Assigned OG role to", n, "members");
