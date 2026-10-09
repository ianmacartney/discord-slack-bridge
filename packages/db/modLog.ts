// Posts a card in the mod channel whenever a command changes a setting, so moderators can see who changed what.
// Best effort: the command already succeeded, so a failure here is logged and never shown as an error.
import type { ConvexHttpClient } from "convex/browser";
import { ChatInputCommandInteraction, EmbedBuilder, Guild } from "discord.js";
import { api } from "./convex/_generated/api.js";
import { CARD_COLOR } from "./convex/brandColors.js";

const ENABLED = CARD_COLOR.added;
const REMOVED = CARD_COLOR.removed;
const REMOVAL_WORDS = /cleared|turned off|no longer|removed|moved/i;

/**
 * `channelId` overrides the saved mod channel. Used when the channel itself changed, to tell the new one that it was
 * chosen (and the old one that it was replaced or cleared).
 */
export async function announceToMods(
  guild: Guild,
  interaction: ChatInputCommandInteraction,
  change: string,
  convex: ConvexHttpClient,
  apiToken: string,
  channelId?: string | null,
) {
  try {
    const target =
      channelId ??
      (await convex.query(api.tags.tagStatus, { guildId: guild.id, apiToken }))
        .modChannelId;
    if (!target) return;
    const channel = await guild.channels.fetch(target);
    if (!channel || !("send" in channel)) return;

    const sub = interaction.options.getSubcommand(false);
    const command = `/${interaction.commandName}${sub ? ` ${sub}` : ""}`;
    const member = interaction.member;
    const name =
      member && "displayName" in member
        ? member.displayName
        : interaction.user.username;
    const embed = new EmbedBuilder()
      .setColor(REMOVAL_WORDS.test(change) ? REMOVED : ENABLED)
      .setAuthor({ name, iconURL: interaction.user.displayAvatarURL() })
      .setTitle("Settings changed")
      .setDescription(change)
      .addFields({ name: "Command", value: `\`${command}\``, inline: true })
      .setTimestamp()
      .setFooter({ text: "Moderator log" });
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (e) {
    console.error("couldn't announce a settings change to the mod channel", e);
  }
}
