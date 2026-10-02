// /confidence: moderators see and change how confident Jev must be before the bot acts. Stored in Convex and applied
// to the whole bot (messages don't record their server), so a change here affects every server the bot is in.
import type { ConvexHttpClient } from "convex/browser";
import {
  ChatInputCommandInteraction,
  Guild,
  PermissionFlagsBits as P,
  SlashCommandBuilder,
} from "discord.js";
import { api } from "./convex/_generated/api.js";
import { THRESHOLD_DEFAULTS } from "./convex/violations.js";
import { announceToMods } from "./modLog.js";

const MIN_VALUE = 0.5;
const LABELS: Record<string, string> = {
  spam: "Spam",
  nsfw_or_violent: "NSFW, violent or doxxing",
  job_solicitation: "Job solicitation",
  piracy_or_secrets: "Piracy or leaked keys",
  harassment: "Harassment (deletes the message)",
  needs_help: "Needs-help follow-up reply",
  tag: "Forum auto-tagging",
};
const choices = Object.keys(THRESHOLD_DEFAULTS).map((name) => ({
  name: LABELS[name] ?? name,
  value: name,
}));

export const confidenceCommand = new SlashCommandBuilder()
  .setName("confidence")
  .setDescription("Change how confident the AI must be before the bot acts")
  // Moderators (anyone who can delete messages) and admins by default.
  .setDefaultMemberPermissions(P.ManageMessages)
  .setDMPermission(false)
  .addSubcommand((s) =>
    s.setName("status").setDescription("Show every threshold"),
  )
  .addSubcommand((s) =>
    s
      .setName("set")
      .setDescription("Set a threshold (higher means fewer, surer actions)")
      .addStringOption((o) =>
        o
          .setName("setting")
          .setDescription("What to change")
          .addChoices(...choices)
          .setRequired(true),
      )
      .addNumberOption((o) =>
        o
          .setName("value")
          .setDescription(`From ${MIN_VALUE} to 1, for example 0.9`)
          .setMinValue(MIN_VALUE)
          .setMaxValue(1)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("reset")
      .setDescription("Go back to the default for a threshold")
      .addStringOption((o) =>
        o
          .setName("setting")
          .setDescription("What to reset")
          .addChoices(...choices)
          .setRequired(true),
      ),
  );

export async function registerConfidenceCommand(guild: Guild) {
  await guild.commands.create(confidenceCommand.toJSON());
}

export async function handleConfidenceCommand(
  interaction: ChatInputCommandInteraction,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Use this in a server.", ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    const sub = interaction.options.getSubcommand();
    if (sub !== "status") {
      const name = interaction.options.getString("setting", true);
      const value = sub === "set" ? interaction.options.getNumber("value", true) : null;
      await convex.mutation(api.thresholds.set, { name, value, apiToken });
      const change =
        value === null
          ? `${LABELS[name]} threshold reset to the default (${THRESHOLD_DEFAULTS[name as keyof typeof THRESHOLD_DEFAULTS]}).`
          : `${LABELS[name]} threshold set to ${value}.`;
      await announceToMods(guild, interaction, change, convex, apiToken);
    }
    const current = await convex.query(api.thresholds.get, { apiToken });
    await interaction.editReply(
      [
        "Confidence needed before the bot acts (applies to every server):",
        ...Object.entries(current).map(([name, value]) => {
          const def = THRESHOLD_DEFAULTS[name as keyof typeof THRESHOLD_DEFAULTS];
          return `${LABELS[name] ?? name}: ${value}${value === def ? "" : ` (default ${def})`}`;
        }),
      ].join("\n"),
    );
  } catch (e) {
    console.error(e);
    await interaction.editReply("Something went wrong. Check the bot logs.");
  }
}
