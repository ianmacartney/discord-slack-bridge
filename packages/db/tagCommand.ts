// /tags: lets moderators choose the support forum whose NEW posts are auto-tagged by Jev (see convex/tags.ts).
// Only the forum chosen here is ever auto-tagged, and only when a post is created.
import type { ConvexHttpClient } from "convex/browser";
import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ForumChannel,
  Guild,
  GuildForumTag,
  GuildForumTagData,
  PermissionFlagsBits as P,
  SlashCommandBuilder,
  SlashCommandStringOption,
} from "discord.js";
import { ConvexError } from "convex/values";
import { api } from "./convex/_generated/api.js";
import { CARD_COLOR } from "./convex/brandColors.js";
import { announceToMods } from "./modLog.js";
import { normalize } from "./convex/tagDefinitions.js";

const kindOption = (o: SlashCommandStringOption) =>
  o
    .setName("kind")
    .setDescription(
      "Type is what sort of post it is. Area is what it is about.",
    )
    .addChoices(
      { name: "Type", value: "type" },
      { name: "Area", value: "area" },
    )
    .setRequired(true);
const whenOption = (required: boolean) => (o: SlashCommandStringOption) =>
  o
    .setName("when")
    .setDescription(
      "When Jev should apply it, in plain words (up to 300 characters)",
    )
    .setMaxLength(300)
    .setRequired(required);

export const tagsCommand = new SlashCommandBuilder()
  .setName("tags")
  .setDescription("Manage auto-tagging of new support posts")
  // Moderators (anyone who can delete messages) and admins by default. Admins can change this per role in
  // Server Settings > Integrations.
  .setDefaultMemberPermissions(P.ManageMessages)
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("forum")
      .setDescription("Set the support forum whose new posts are auto-tagged")
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("The forum channel")
          .addChannelTypes(ChannelType.GuildForum)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName("clear-forum").setDescription("Stop auto-tagging"),
  )
  .addSubcommand((s) =>
    s
      .setName("status")
      .setDescription("Show the auto-tag forum and any tags it is missing"),
  )
  .addSubcommand((s) =>
    s
      .setName("retag")
      .setDescription(
        "Run auto-tagging again on this post (use inside a post)",
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("audit")
      .setDescription(
        "Show the latest auto-tag decisions and how often they were corrected",
      )
      .addIntegerOption((o) =>
        o
          .setName("count")
          .setDescription("How many decisions to show (default 10)")
          .setMinValue(1)
          .setMaxValue(20),
      ),
  )
  .addSubcommandGroup((g) =>
    g
      .setName("rule")
      .setDescription("Change which tags Jev can apply, and when")
      .addSubcommand((s) =>
        s
          .setName("list")
          .setDescription("Show every tag Jev can apply and its description"),
      )
      .addSubcommand((s) =>
        s
          .setName("add")
          .setDescription(
            "Let Jev apply a new tag (create it in the forum with /tags-setup add)",
          )
          .addStringOption(kindOption)
          .addStringOption((o) =>
            o
              .setName("tag")
              .setDescription("The forum tag's name")
              .setMaxLength(20)
              .setRequired(true),
          )
          .addStringOption(whenOption(true)),
      )
      .addSubcommand((s) =>
        s
          .setName("edit")
          .setDescription("Change when a tag applies, or its name")
          .addStringOption(kindOption)
          .addStringOption((o) =>
            o
              .setName("tag")
              .setDescription("The tag to change")
              .setRequired(true),
          )
          .addStringOption(whenOption(false))
          .addStringOption((o) =>
            o
              .setName("new_name")
              .setDescription("Rename the tag Jev looks for")
              .setMaxLength(20),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName("remove")
          .setDescription(
            "Stop Jev applying a tag (the forum tag itself stays)",
          )
          .addStringOption(kindOption)
          .addStringOption((o) =>
            o
              .setName("tag")
              .setDescription("The tag to stop using")
              .setRequired(true),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName("reset")
          .setDescription("Go back to the built-in description for a tag")
          .addStringOption(kindOption)
          .addStringOption((o) =>
            o
              .setName("tag")
              .setDescription("The tag to reset")
              .setRequired(true),
          ),
      ),
  );

export async function registerTagsCommand(guild: Guild) {
  // `create` adds or overwrites only this command, unlike `set` which would replace all of them.
  await guild.commands.create(tagsCommand.toJSON());
}

/** Tag names the auto-tagger can apply that this forum doesn't have yet. */
function missingTags(forum: ForumChannel, wanted: string[]) {
  const have = new Set(forum.availableTags.map((t) => normalize(t.name)));
  return [...new Set(wanted)].filter((name) => !have.has(normalize(name)));
}

/**
 * A card showing the forum's tags, grouped by how Jev uses them: post types, areas, and tags it never applies (such as
 * Resolved). Tags Jev would apply but the forum doesn't have yet are called out.
 */
async function forumTagsEmbed(
  guild: Guild,
  forum: ForumChannel,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const { type, area } = await convex.query(api.tagRules.list, {
    guildId: guild.id,
    apiToken,
  });
  const used = new Set<string>();
  const group = (rules: typeof type) => {
    const wanted = new Set(
      rules.flatMap((r) => (r.tag ? [normalize(r.tag)] : [])),
    );
    const lines = forum.availableTags
      .filter((t) => wanted.has(normalize(t.name)))
      .map((t) => {
        used.add(t.id);
        return tagLine(t);
      });
    return lines.join("\n").slice(0, 1000) || "None yet";
  };
  const typeText = group(type);
  const areaText = group(area);
  const others = forum.availableTags.filter((t) => !used.has(t.id));
  const have = new Set(forum.availableTags.map((t) => normalize(t.name)));
  const missing = [...type, ...area].flatMap((r) =>
    r.tag && !have.has(normalize(r.tag)) ? [r.tag] : [],
  );

  const embed = new EmbedBuilder()
    .setColor(CARD_COLOR.info)
    .setTitle(`Tags in #${forum.name}`)
    .setDescription(
      `Jev picks one **type** and one **area** for each new post. Posts can hold up to 5 tags.`,
    )
    .addFields(
      { name: "Type", value: typeText, inline: true },
      { name: "Area", value: areaText, inline: true },
    )
    .setFooter({
      text: `${forum.availableTags.length} of ${MAX_FORUM_TAGS} tags used`,
    });
  if (others.length) {
    embed.addFields({
      name: "Not applied by Jev",
      value: others.map(tagLine).join("\n").slice(0, 1000),
    });
  }
  if (missing.length) {
    embed.addFields({
      name: "Jev wants these, but the forum doesn't have them",
      value: missing
        .map((m) => `• ${m}`)
        .join("\n")
        .slice(0, 1000),
    });
  }
  const icon = guild.iconURL();
  if (icon) embed.setThumbnail(icon);
  return embed;
}

/** "• 🐛 Bug Report", with a custom emoji shown as a mention so Discord renders it. */
function tagLine(t: GuildForumTag) {
  const emoji = t.emoji?.id ? `<:e:${t.emoji.id}>` : t.emoji?.name ?? "";
  return `• ${emoji ? `${emoji} ` : ""}${t.name}${t.moderated ? " (mods only)" : ""}`;
}

/** Names of every tag Jev can currently apply in this server (built-in definitions plus moderators' changes). */
async function wantedTags(
  guild: Guild,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const { type, area } = await convex.query(api.tagRules.list, {
    guildId: guild.id,
    apiToken,
  });
  return [...type, ...area].flatMap((d) => (d.tag ? [d.tag] : []));
}

async function describeForum(
  guild: Guild,
  forumId: string,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const forum = await guild.channels.fetch(forumId);
  if (!forum || forum.type !== ChannelType.GuildForum) {
    return {
      content: `<#${forumId}> is no longer a forum channel. Pick one with /tags forum.`,
      embeds: [],
    };
  }
  const lines = [`Auto-tagging new posts in <#${forum.id}>.`];
  const missing = missingTags(forum, await wantedTags(guild, convex, apiToken));
  lines.push(
    missing.length
      ? `Create these tags in the forum so they can be applied: ${missing.join(", ")}.`
      : "The forum has every tag the auto-tagger can apply.",
  );
  const me = guild.members.me;
  const mine = me ? forum.permissionsFor(me) : null;
  if (!mine?.has([P.ViewChannel, P.ManageThreads])) {
    lines.push(
      "I need View Channel and Manage Threads in that forum to apply tags.",
    );
  }
  return {
    content: lines.join("\n"),
    embeds: [await forumTagsEmbed(guild, forum, convex, apiToken)],
  };
}

/** /tags rule: change which tags Jev applies and the description it reads. Takes effect on the next post. */
async function handleRule(
  interaction: ChatInputCommandInteraction,
  convex: ConvexHttpClient,
  apiToken: string,
  guild: Guild,
) {
  const sub = interaction.options.getSubcommand();
  if (sub === "list") {
    const { type, area } = await convex.query(api.tagRules.list, {
      guildId: guild.id,
      apiToken,
    });
    const show = (title: string, rows: typeof type) =>
      `**${title}**\n${rows
        .map(
          (r) =>
            `- ${r.tag ?? "(no tag)"}${r.custom ? " (changed)" : ""}: ${r.when}`,
        )
        .join("\n")}`;
    await interaction.editReply(
      `${show("Type", type)}\n\n${show("Area", area)}`.slice(0, 1900),
    );
    return;
  }
  const kind = interaction.options.getString("kind", true) as "type" | "area";
  const name = interaction.options.getString("tag", true);
  const base = { guildId: guild.id, kind, name, apiToken };
  let change: string;
  try {
    if (sub === "add" || sub === "edit") {
      const result = await convex.mutation(api.tagRules.save, {
        ...base,
        when: interaction.options.getString("when") ?? undefined,
        newName: interaction.options.getString("new_name") ?? undefined,
      });
      change = `${result === "added" ? "Added" : "Updated"} the ${kind} tag "${interaction.options.getString("new_name") ?? name}" for the auto-tagger.`;
    } else if (sub === "remove") {
      const tag = await convex.mutation(api.tagRules.remove, base);
      change = `Jev no longer applies the ${kind} tag "${tag}". The forum tag itself is untouched.`;
    } else {
      const tag = await convex.mutation(api.tagRules.reset, base);
      change = `Reset "${tag}" to the built-in definition (a tag you added is removed).`;
    }
  } catch (e) {
    // ConvexError messages are written for moderators, e.g. "There is already a definition for ...".
    if (!(e instanceof ConvexError)) throw e;
    await interaction.editReply(String(e.data));
    return;
  }
  // Remind them when the forum doesn't have the tag yet, since Jev can only apply tags that exist.
  const forumId = await convex.query(api.guildSettings.getTagForum, {
    guildId: guild.id,
    apiToken,
  });
  let hint = "";
  if (forumId && (sub === "add" || sub === "edit")) {
    const forum = await guild.channels.fetch(forumId);
    const tag = interaction.options.getString("new_name") ?? name;
    if (
      forum?.type === ChannelType.GuildForum &&
      missingTags(forum, [tag]).length
    ) {
      hint = ` The forum has no "${tag}" tag yet: create it with /tags-setup add.`;
    }
  }
  await interaction.editReply(change + hint);
  await announceToMods(guild, interaction, change, convex, apiToken);
}

export async function handleTagsCommand(
  interaction: ChatInputCommandInteraction,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "Use this in a server.",
      ephemeral: true,
    });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    if (interaction.options.getSubcommandGroup(false) === "rule") {
      await handleRule(interaction, convex, apiToken, guild);
      return;
    }
    const sub = interaction.options.getSubcommand();
    if (sub === "forum") {
      const channel = interaction.options.getChannel("channel", true);
      await convex.mutation(api.guildSettings.setTagForum, {
        guildId: guild.id,
        tagForumId: channel.id,
        apiToken,
      });
      await interaction.editReply(
        await describeForum(guild, channel.id, convex, apiToken),
      );
      await announceToMods(
        guild,
        interaction,
        `Auto-tag forum set to <#${channel.id}>.`,
        convex,
        apiToken,
      );
    } else if (sub === "clear-forum") {
      await convex.mutation(api.guildSettings.setTagForum, {
        guildId: guild.id,
        tagForumId: null,
        apiToken,
      });
      await interaction.editReply("Auto-tagging is off.");
      await announceToMods(
        guild,
        interaction,
        "Auto-tagging turned off.",
        convex,
        apiToken,
      );
    } else if (sub === "retag") {
      const forumId = await convex.query(api.guildSettings.getTagForum, {
        guildId: guild.id,
        apiToken,
      });
      const channel = interaction.channel;
      if (!channel?.isThread() || !forumId || channel.parentId !== forumId) {
        await interaction.editReply(
          "Run this inside a post in the auto-tag forum (set with /tags forum).",
        );
        return;
      }
      const result = await convex.mutation(api.tags.requestRetag, {
        discordThreadId: channel.id,
        triggeredBy: interaction.user.id,
        apiToken,
      });
      await interaction.editReply(
        result.ok
          ? "Re-running auto-tagging on this post. The tags update in a few seconds."
          : result.reason ?? "Couldn't re-run auto-tagging.",
      );
    } else if (sub === "audit") {
      const count = interaction.options.getInteger("count") ?? 10;
      const { rows, stats } = await convex.query(api.tags.recentDecisions, {
        guildId: guild.id,
        limit: count,
        apiToken,
      });
      if (rows.length === 0) {
        await interaction.editReply("No auto-tag decisions yet.");
        return;
      }
      const lines = rows.map((r) => {
        const tags = r.tags.length
          ? r.tags.map((t) => `${t.name} ${t.confidence.toFixed(2)}`).join(", ")
          : `no tags${r.notes.length ? ` (${r.notes[0]})` : ""}`;
        return `<#${r.discordThreadId}>: ${tags} [${r.status}, ${r.trigger}]`;
      });
      const corrected = stats.undone + stats.superseded + stats.edited;
      lines.push(
        `Last ${stats.total}: ${stats.applied} applied, ${stats.undone} undone, ${stats.superseded} re-run, ${stats.edited} edited (${corrected} corrected).`,
      );
      await interaction.editReply(lines.join("\n").slice(0, 1900));
    } else {
      const [forumId, { modChannelId }] = await Promise.all([
        convex.query(api.guildSettings.getTagForum, {
          guildId: guild.id,
          apiToken,
        }),
        convex.query(api.tags.tagStatus, { guildId: guild.id, apiToken }),
      ]);
      const forum = forumId
        ? await describeForum(guild, forumId, convex, apiToken)
        : {
            content: "No forum is set. Pick one with /tags forum.",
            embeds: [],
          };
      await interaction.editReply({
        content: `${forum.content}\n${
          modChannelId
            ? `Mod notes with Undo go to <#${modChannelId}>.`
            : "Mod notes are off: an admin can set a mod channel with /modchannel set."
        }`,
        embeds: forum.embeds,
      });
    }
  } catch (e) {
    console.error(e);
    await interaction.editReply("Something went wrong. Check the bot logs.");
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// /tags-setup: creates the forum tags the auto-tagger uses. A separate command so it can be admins-only, unlike /tags.

// Discord allows at most 20 tags on a forum.
const MAX_FORUM_TAGS = 20;

/** An error whose message is safe to show to whoever ran the command. */
class UserError extends Error {}

export const tagsSetupCommand = new SlashCommandBuilder()
  .setName("tags-setup")
  .setDescription("Create and edit forum tags (admins only)")
  .setDefaultMemberPermissions(P.Administrator)
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("preview")
      .setDescription(
        "Show which tags would be created, without changing anything",
      )
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription(
            "The forum (defaults to the one set with /tags forum)",
          )
          .addChannelTypes(ChannelType.GuildForum),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("create")
      .setDescription("Create the missing tags, keeping the existing ones")
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription(
            "The forum (defaults to the one set with /tags forum)",
          )
          .addChannelTypes(ChannelType.GuildForum),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Add one tag, with an optional emoji")
      .addStringOption((o) =>
        o
          .setName("name")
          .setDescription("Tag name")
          .setMaxLength(20)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("emoji")
          .setDescription("An emoji, for example 🐛 or a server emoji"),
      )
      .addBooleanOption((o) =>
        o
          .setName("moderated")
          .setDescription("Only moderators can apply this tag"),
      )
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription(
            "The forum (defaults to the one set with /tags forum)",
          )
          .addChannelTypes(ChannelType.GuildForum),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("rename")
      .setDescription("Rename a tag (posts keep it)")
      .addStringOption((o) =>
        o
          .setName("tag")
          .setDescription("The tag's current name")
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("new_name")
          .setDescription("New name")
          .setMaxLength(20)
          .setRequired(true),
      )
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription(
            "The forum (defaults to the one set with /tags forum)",
          )
          .addChannelTypes(ChannelType.GuildForum),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("emoji")
      .setDescription("Set or remove a tag's emoji")
      .addStringOption((o) =>
        o.setName("tag").setDescription("The tag's name").setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("emoji")
          .setDescription("An emoji, or none to remove it")
          .setRequired(true),
      )
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription(
            "The forum (defaults to the one set with /tags forum)",
          )
          .addChannelTypes(ChannelType.GuildForum),
      ),
  );

export async function registerTagsSetupCommand(guild: Guild) {
  await guild.commands.create(tagsSetupCommand.toJSON());
}

const MAX_NAME_LENGTH = 20;

/** Discord wants a custom emoji as an id and a normal one as its character. "none" removes the emoji. */
function parseEmoji(input: string) {
  const text = input.trim();
  if (text.toLowerCase() === "none") return null;
  const custom = text.match(/^<a?:\w+:(\d+)>$/);
  if (custom) return { id: custom[1], name: null };
  // \p{Extended_Pictographic} covers emoji; \uFE0F and \u200D are the variation and joiner characters.
  if (
    /^[\p{Extended_Pictographic}\uFE0F\u200D]+$|^[\u{1F1E6}-\u{1F1FF}]{2}$/u.test(
      text,
    )
  ) {
    return { id: null, name: text };
  }
  throw new UserError(
    "That isn't an emoji. Use a normal emoji like 🐛, or a server emoji picked from the emoji menu.",
  );
}

async function editTag(
  interaction: ChatInputCommandInteraction,
  convex: ConvexHttpClient,
  apiToken: string,
  guild: Guild,
  forum: ForumChannel,
  sub: "add" | "rename" | "emoji",
) {
  const existing: GuildForumTagData[] = forum.availableTags.map((t) => ({
    id: t.id,
    name: t.name,
    moderated: t.moderated,
    emoji: t.emoji,
  }));
  const reason = `Edited by ${interaction.user.tag} with /tags-setup ${sub}`;
  const find = (name: string) => {
    const tag = existing.find((t) => normalize(t.name) === normalize(name));
    if (!tag) {
      throw new UserError(
        `No tag named "${name}". Tags in <#${forum.id}>: ${existing.map((t) => t.name).join(", ") || "none"}.`,
      );
    }
    return tag;
  };
  const taken = (name: string) =>
    existing.some((t) => normalize(t.name) === normalize(name));

  let tags = existing;
  let change: string;
  if (sub === "add") {
    const name = interaction.options.getString("name", true).trim();
    if (taken(name))
      throw new UserError(`<#${forum.id}> already has a tag named "${name}".`);
    if (existing.length >= MAX_FORUM_TAGS) {
      throw new UserError(
        `The forum is full (${MAX_FORUM_TAGS} tags). Remove one first.`,
      );
    }
    const emojiInput = interaction.options.getString("emoji");
    tags = [
      ...existing,
      {
        name,
        moderated: interaction.options.getBoolean("moderated") ?? false,
        emoji: emojiInput ? parseEmoji(emojiInput) : null,
      },
    ];
    change = `Added the tag "${name}" to <#${forum.id}>.`;
  } else if (sub === "rename") {
    const tag = find(interaction.options.getString("tag", true));
    const name = interaction.options.getString("new_name", true).trim();
    if (name.length > MAX_NAME_LENGTH)
      throw new UserError("Tag names are at most 20 characters.");
    if (normalize(name) !== normalize(tag.name) && taken(name)) {
      throw new UserError(`There is already a tag named "${name}".`);
    }
    tags = existing.map((t) => (t === tag ? { ...t, name } : t));
    change = `Renamed the tag "${tag.name}" to "${name}" in <#${forum.id}>.`;
    // The auto-tagger finds tags by name, so renaming one of its tags turns that tag off.
    const usedByAutoTagger = (await wantedTags(guild, convex, apiToken)).some(
      (name) => normalize(name) === normalize(tag.name),
    );
    if (usedByAutoTagger) {
      change += ` Auto-tagging looks tags up by name, so it won't apply this one until a tag called "${tag.name}" exists again.`;
    }
  } else {
    const tag = find(interaction.options.getString("tag", true));
    const emoji = parseEmoji(interaction.options.getString("emoji", true));
    tags = existing.map((t) => (t === tag ? { ...t, emoji } : t));
    change = emoji
      ? `Set the emoji on "${tag.name}" in <#${forum.id}>.`
      : `Removed the emoji from "${tag.name}" in <#${forum.id}>.`;
  }
  const updated = await forum.setAvailableTags(tags, reason);
  await interaction.editReply({
    content: change,
    embeds: [await forumTagsEmbed(guild, updated, convex, apiToken)],
  });
  await announceToMods(guild, interaction, change, convex, apiToken);
}

export async function handleTagsSetupCommand(
  interaction: ChatInputCommandInteraction,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const guild = interaction.guild;
  // Discord already hides the command from non-admins; this keeps it admin-only even if the server opens it up.
  if (!guild || !interaction.memberPermissions?.has(P.Administrator)) {
    await interaction.reply({
      content: "Only server admins can use this.",
      ephemeral: true,
    });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    const forumId =
      interaction.options.getChannel("channel")?.id ??
      (await convex.query(api.guildSettings.getTagForum, {
        guildId: guild.id,
        apiToken,
      }));
    if (!forumId) {
      throw new UserError(
        "Pick a forum with the channel option, or set one first with /tags forum.",
      );
    }
    const forum = await guild.channels.fetch(forumId);
    if (!forum || forum.type !== ChannelType.GuildForum) {
      throw new UserError("That isn't a forum channel.");
    }

    const sub = interaction.options.getSubcommand();
    if (sub === "add" || sub === "rename" || sub === "emoji") {
      await editTag(interaction, convex, apiToken, guild, forum, sub);
      return;
    }

    const missing = missingTags(
      forum,
      await wantedTags(guild, convex, apiToken),
    );
    if (missing.length === 0) {
      await interaction.editReply({
        content: "Nothing to create: the forum has every tag Jev uses.",
        embeds: [await forumTagsEmbed(guild, forum, convex, apiToken)],
      });
      return;
    }
    const room = Math.max(MAX_FORUM_TAGS - forum.availableTags.length, 0);
    const toCreate = missing.slice(0, room);
    const noRoom = missing.slice(room);
    const skippedNote = noRoom.length
      ? ` No room for: ${noRoom.join(", ")} (forums hold ${MAX_FORUM_TAGS} tags). Remove some tags and run this again.`
      : "";

    if (interaction.options.getSubcommand() === "preview") {
      await interaction.editReply({
        content: `Would create in <#${forum.id}>: ${toCreate.join(", ") || "nothing"}. Existing tags stay as they are.${skippedNote}`,
        embeds: [await forumTagsEmbed(guild, forum, convex, apiToken)],
      });
      return;
    }
    if (toCreate.length === 0) {
      await interaction.editReply(`The forum is full.${skippedNote}`);
      return;
    }
    await forum.setAvailableTags(
      [
        // Pass the existing tags back unchanged (with their ids) so they aren't recreated or lost.
        ...forum.availableTags.map((t) => ({
          id: t.id,
          name: t.name,
          moderated: t.moderated,
          emoji: t.emoji,
        })),
        ...toCreate.map((name) => ({ name, moderated: false })),
      ],
      `Created by ${interaction.user.tag} with /tags-setup`,
    );
    await interaction.editReply({
      content: `Created in <#${forum.id}>: ${toCreate.join(", ")}.${skippedNote}`,
      embeds: [
        await forumTagsEmbed(guild, await forum.fetch(), convex, apiToken),
      ],
    });
    await announceToMods(
      guild,
      interaction,
      `Created forum tags in <#${forum.id}>: ${toCreate.join(", ")}.`,
      convex,
      apiToken,
    );
  } catch (e) {
    if (e instanceof UserError) {
      await interaction.editReply(e.message);
      return;
    }
    console.error(e);
    const missingPermission = (e as { code?: number }).code === 50013;
    await interaction.editReply(
      missingPermission
        ? "I need the Manage Channels permission in that forum to create tags."
        : "Something went wrong. Check the bot logs.",
    );
  }
}
