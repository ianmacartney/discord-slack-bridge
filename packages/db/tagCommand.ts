import type { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  ForumChannel,
  Guild,
  GuildForumTagData,
  PermissionFlagsBits as P,
  SlashCommandBuilder,
} from "discord.js";
import { api } from "./convex/_generated/api.js";
import { normalize } from "./convex/tagDefinitions.js";
import { announceToMods } from "./modLog.js";

// Discord's limits: 20 tags per forum, 20 characters per tag name.
const MAX_FORUM_TAGS = 20;
const MAX_NAME_LENGTH = 20;

/** An error whose message is safe to show to the moderator who ran the command. */
class UserError extends Error {}

export const tagsCommand = new SlashCommandBuilder()
  .setName("tags")
  .setDescription("Auto-tagging of new support posts")
  // Moderators (anyone who can delete messages) and admins by default.
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
      .setName("add")
      .setDescription(
        "Add a tag to the forum, optionally telling Jev when to use it",
      )
      .addStringOption((o) =>
        o
          .setName("name")
          .setDescription("Tag name")
          .setMaxLength(MAX_NAME_LENGTH)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("when")
          .setDescription(
            "When Jev should apply it, in plain words (default: the name)",
          )
          .setMaxLength(300),
      )
      .addStringOption((o) =>
        o.setName("emoji").setDescription("An emoji, for example 🐛"),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("edit")
      .setDescription("Change a tag's name, emoji or when Jev uses it")
      .addStringOption((o) =>
        o
          .setName("tag")
          .setDescription("The tag to change")
          .setAutocomplete(true)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("new_name")
          .setDescription("New name")
          .setMaxLength(MAX_NAME_LENGTH),
      )
      .addStringOption((o) =>
        o
          .setName("when")
          .setDescription("When Jev should apply it")
          .setMaxLength(300),
      )
      .addStringOption((o) =>
        o.setName("emoji").setDescription("An emoji, or none to remove it"),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("delete")
      .setDescription("Remove tags from the forum and stop Jev using them")
      .addStringOption((o) =>
        o
          .setName("tags")
          .setDescription("One or more tags, separated by commas")
          .setAutocomplete(true)
          .setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("delete-all")
      .setDescription("Remove every tag except Resolved (asks you to confirm)"),
  );

export async function registerTagsCommand(guild: Guild) {
  // `create` adds or overwrites only this command, unlike `set` which would replace all of them.
  await guild.commands.create(tagsCommand.toJSON());
}

/** Discord wants a custom emoji as an id and a normal one as its character. "none" removes the emoji. */
function parseEmoji(input: string) {
  const text = input.trim();
  if (text.toLowerCase() === "none") return null;
  const custom = text.match(/^<a?:\w+:(\d+)>$/);
  if (custom) return { id: custom[1], name: null };
  // \p{Extended_Pictographic} covers emoji; ️ and ‍ are the variation and joiner characters.
  if (
    /^[\p{Extended_Pictographic}️‍]+$|^[\u{1F1E6}-\u{1F1FF}]{2}$/u.test(text)
  ) {
    return { id: null, name: text };
  }
  throw new UserError(
    "That isn't an emoji. Use a normal emoji like 🐛, or a server emoji picked from the emoji menu.",
  );
}

async function autoTagForum(
  guild: Guild,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const forumId = await convex.query(api.guildSettings.getTagForum, {
    guildId: guild.id,
    apiToken,
  });
  const forum = forumId ? await guild.channels.fetch(forumId) : null;
  if (!forum || forum.type !== ChannelType.GuildForum) {
    throw new UserError("Pick the support forum first with /tags forum.");
  }
  return forum;
}

/** The forum's tags in the shape `setAvailableTags` takes, so existing tags keep their ids. */
const currentTags = (forum: ForumChannel): GuildForumTagData[] =>
  forum.availableTags.map((t) => ({
    id: t.id,
    name: t.name,
    moderated: t.moderated,
    emoji: t.emoji,
  }));

async function addTag(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const forum = await autoTagForum(guild, convex, apiToken);
  const name = interaction.options.getString("name", true).trim();
  const when = interaction.options.getString("when");
  const emojiInput = interaction.options.getString("emoji");
  const tags = currentTags(forum);
  if (!tags.some((t) => normalize(t.name) === normalize(name))) {
    if (tags.length >= MAX_FORUM_TAGS) {
      throw new UserError(
        `The forum already has ${MAX_FORUM_TAGS} tags. Delete one first.`,
      );
    }
    await forum.setAvailableTags(
      [
        ...tags,
        {
          name,
          moderated: false,
          emoji: emojiInput ? parseEmoji(emojiInput) : null,
        },
      ],
      `Added by ${interaction.user.tag} with /tags add`,
    );
  }
  if (when) {
    await convex.mutation(api.tagRules.save, {
      guildId: guild.id,
      name,
      when,
      apiToken,
    });
  }
  return `Added the tag "${name}" to <#${forum.id}>. Jev will use it on new posts.`;
}

async function editTag(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const forum = await autoTagForum(guild, convex, apiToken);
  const name = interaction.options.getString("tag", true).trim();
  const newName = interaction.options.getString("new_name")?.trim() || null;
  const when = interaction.options.getString("when");
  const emojiInput = interaction.options.getString("emoji");
  if (!newName && !when && !emojiInput) {
    throw new UserError(
      "Give a new name, a new description or an emoji to change.",
    );
  }
  const tags = currentTags(forum);
  const tag = tags.find((t) => normalize(t.name) === normalize(name));
  if (!tag) {
    throw new UserError(
      `No tag named "${name}". Tags in <#${forum.id}>: ${tags.map((t) => t.name).join(", ") || "none"}.`,
    );
  }
  if (
    newName &&
    normalize(newName) !== normalize(tag.name) &&
    tags.some((t) => normalize(t.name) === normalize(newName))
  ) {
    throw new UserError(`There is already a tag named "${newName}".`);
  }
  if (newName || emojiInput) {
    await forum.setAvailableTags(
      tags.map((t) =>
        t === tag
          ? {
              ...t,
              name: newName ?? t.name,
              emoji: emojiInput ? parseEmoji(emojiInput) : t.emoji,
            }
          : t,
      ),
      `Edited by ${interaction.user.tag} with /tags edit`,
    );
  }
  if (when || newName) {
    await convex.mutation(api.tagRules.save, {
      guildId: guild.id,
      name: tag.name,
      newName: newName ?? undefined,
      when: when ?? undefined,
      apiToken,
    });
  }
  return `Updated the tag "${newName ?? tag.name}" in <#${forum.id}>.`;
}

async function deleteTags(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const forum = await autoTagForum(guild, convex, apiToken);
  const names = [
    ...new Set(
      interaction.options
        .getString("tags", true)
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];
  const tags = currentTags(forum);
  const deleted: string[] = [];
  const notFound: string[] = [];
  const keep = new Set(tags);
  for (const name of names) {
    const tag = tags.find((t) => normalize(t.name) === normalize(name));
    const described = await convex.mutation(api.tagRules.remove, {
      guildId: guild.id,
      name,
      apiToken,
    });
    if (!tag && !described) {
      notFound.push(name);
      continue;
    }
    if (tag) keep.delete(tag);
    deleted.push(tag?.name ?? name);
  }
  if (deleted.length === 0) {
    throw new UserError(
      `No tag named ${notFound.map((n) => `"${n}"`).join(", ")}.`,
    );
  }
  // One update for all of them, so the forum's tag list changes once.
  if (keep.size !== tags.length) {
    await forum.setAvailableTags(
      [...keep],
      `Deleted by ${interaction.user.tag} with /tags delete`,
    );
  }
  const list = deleted.map((n) => `"${n}"`).join(", ");
  return (
    `Deleted ${deleted.length === 1 ? "the tag" : "the tags"} ${list} from <#${forum.id}>. Jev won't use ${deleted.length === 1 ? "it" : "them"} anymore.` +
    (notFound.length
      ? ` Not found: ${notFound.map((n) => `"${n}"`).join(", ")}.`
      : "")
  );
}

// The Resolve button applies this tag, so delete-all keeps it.
const resolvedTagId = process.env.DISCORD_RESOLVED_TAG_ID;
const CONFIRM_SECONDS = 30;

/** Deletes every forum tag except Resolved and stops Jev using any tag, after the moderator confirms. */
async function deleteAllTags(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const forum = await autoTagForum(guild, convex, apiToken);
  const tags = currentTags(forum);
  const keep = tags.filter((t) => t.id === resolvedTagId);
  const remove = tags.filter((t) => t.id !== resolvedTagId);
  const rules = await convex.query(api.tagRules.list, {
    guildId: guild.id,
    apiToken,
  });
  if (remove.length === 0 && rules.length === 0) {
    throw new UserError("There are no tags to delete.");
  }

  const reply = await interaction.editReply({
    content: `Delete all ${remove.length} tags from <#${forum.id}>${keep.length ? " (Resolved stays)" : ""}? Jev will stop tagging until you add tags again. Posts lose these tags too.`,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("confirm")
          .setLabel("Delete all")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("cancel")
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
  const click = await reply
    .awaitMessageComponent({
      time: CONFIRM_SECONDS * 1000,
      filter: (i) => i.user.id === interaction.user.id,
    })
    .catch(() => null);
  if (!click || click.customId !== "confirm") {
    await interaction.editReply({
      content: "Nothing was deleted.",
      components: [],
    });
    return null;
  }
  await click.update({ content: "Deleting…", components: [] });

  if (remove.length) {
    await forum.setAvailableTags(
      keep,
      `Deleted by ${interaction.user.tag} with /tags delete-all`,
    );
  }
  for (const d of rules) {
    await convex.mutation(api.tagRules.remove, {
      guildId: guild.id,
      name: d.tag,
      apiToken,
    });
  }
  return `Deleted all ${remove.length} tags from <#${forum.id}>${keep.length ? ", kept Resolved" : ""}. Jev won't tag posts until tags are added again.`;
}

export async function handleTagsAutocomplete(
  interaction: AutocompleteInteraction,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const guild = interaction.guild;
  if (!guild) return interaction.respond([]);
  const focused = interaction.options.getFocused(true);
  const parts = focused.value.split(",");
  const typed = normalize(parts.pop() ?? "");
  const already = parts.map((p) => p.trim()).filter(Boolean);
  const prefix = already.length ? `${already.join(", ")}, ` : "";
  const forum = await autoTagForum(guild, convex, apiToken).catch(() => null);
  const names = (forum?.availableTags ?? [])
    .map((t) => t.name)
    .filter((name) => !already.some((a) => normalize(a) === normalize(name)));
  await interaction.respond(
    names
      .filter((name) => normalize(name).includes(typed))
      .map((name) => `${prefix}${name}`)
      .filter((value) => value.length <= 100)
      .slice(0, 25)
      .map((value) => ({ name: value, value })),
  );
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
    const sub = interaction.options.getSubcommand();
    let change: string;
    if (sub === "forum") {
      const channel = interaction.options.getChannel("channel", true);
      await convex.mutation(api.guildSettings.setTagForum, {
        guildId: guild.id,
        tagForumId: channel.id,
        apiToken,
      });
      change = `Auto-tagging new posts in <#${channel.id}>.`;
    } else if (sub === "clear-forum") {
      await convex.mutation(api.guildSettings.setTagForum, {
        guildId: guild.id,
        tagForumId: null,
        apiToken,
      });
      change = "Auto-tagging turned off.";
    } else if (sub === "add") {
      change = await addTag(interaction, guild, convex, apiToken);
    } else if (sub === "edit") {
      change = await editTag(interaction, guild, convex, apiToken);
    } else if (sub === "delete") {
      change = await deleteTags(interaction, guild, convex, apiToken);
    } else {
      const done = await deleteAllTags(interaction, guild, convex, apiToken);
      if (!done) return;
      change = done;
    }
    await interaction.editReply({ content: change, components: [] });
    await announceToMods(guild, interaction, change, convex, apiToken);
  } catch (e) {
    if (e instanceof UserError) {
      await interaction.editReply(e.message);
      return;
    }
    if (e instanceof ConvexError) {
      await interaction.editReply(String(e.data));
      return;
    }
    console.error(e);
    const missingPermission = (e as { code?: number }).code === 50013;
    await interaction.editReply(
      missingPermission
        ? "I need the Manage Channels permission in that forum to change its tags."
        : "Something went wrong. Check the bot logs.",
    );
  }
}
