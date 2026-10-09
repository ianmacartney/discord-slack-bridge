// /tags: moderators pick the support forum that Jev auto-tags (see convex/tags.ts) and manage its tags. Each tag is a
// forum tag plus one line telling Jev when to use it, so adding, editing or deleting one updates both.
import type { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import {
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
      .setDescription("Add a tag to the forum and tell Jev when to use it")
      .addStringOption((o) =>
        o
          .setName("name")
          .setDescription("Tag name")
          .setMaxLength(MAX_NAME_LENGTH)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("kind")
          .setDescription(
            "Type is what sort of post it is, area is what it's about",
          )
          .addChoices(
            { name: "Type", value: "type" },
            { name: "Area", value: "area" },
          )
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("when")
          .setDescription("When Jev should apply it, in plain words")
          .setMaxLength(300)
          .setRequired(true),
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
        o.setName("tag").setDescription("The tag to change").setRequired(true),
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
      .setDescription("Remove a tag from the forum and stop Jev using it")
      .addStringOption((o) =>
        o.setName("tag").setDescription("The tag to remove").setRequired(true),
      ),
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

/** Which of Jev's two questions (type or area) a tag belongs to, if any. */
async function kindOf(
  guild: Guild,
  name: string,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const { type, area } = await convex.query(api.tagRules.list, {
    guildId: guild.id,
    apiToken,
  });
  const matches = (d: { tag: string | null }) =>
    d.tag !== null && normalize(d.tag) === normalize(name);
  if (type.some(matches)) return "type" as const;
  if (area.some(matches)) return "area" as const;
  return null;
}

async function addTag(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const forum = await autoTagForum(guild, convex, apiToken);
  const name = interaction.options.getString("name", true).trim();
  const kind = interaction.options.getString("kind", true) as "type" | "area";
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
  await convex.mutation(api.tagRules.save, {
    guildId: guild.id,
    kind,
    name,
    when: interaction.options.getString("when", true),
    apiToken,
  });
  return `Added the ${kind} tag "${name}" to <#${forum.id}>. Jev will use it on new posts.`;
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
  // Keep Jev's description in step with the forum tag.
  const kind = await kindOf(guild, tag.name, convex, apiToken);
  if (kind && (newName || when)) {
    await convex.mutation(api.tagRules.save, {
      guildId: guild.id,
      kind,
      name: tag.name,
      newName: newName ?? undefined,
      when: when ?? undefined,
      apiToken,
    });
  }
  return `Updated the tag "${newName ?? tag.name}" in <#${forum.id}>.`;
}

async function deleteTag(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  convex: ConvexHttpClient,
  apiToken: string,
) {
  const forum = await autoTagForum(guild, convex, apiToken);
  const name = interaction.options.getString("tag", true).trim();
  const tags = currentTags(forum);
  const tag = tags.find((t) => normalize(t.name) === normalize(name));
  const kind = await kindOf(guild, name, convex, apiToken);
  if (!tag && !kind) throw new UserError(`No tag named "${name}".`);
  if (tag) {
    await forum.setAvailableTags(
      tags.filter((t) => t !== tag),
      `Deleted by ${interaction.user.tag} with /tags delete`,
    );
  }
  if (kind) {
    await convex.mutation(api.tagRules.remove, {
      guildId: guild.id,
      kind,
      name,
      apiToken,
    });
  }
  return `Deleted the tag "${tag?.name ?? name}" from <#${forum.id}>. Jev won't use it anymore.`;
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
    } else {
      change = await deleteTag(interaction, guild, convex, apiToken);
    }
    await interaction.editReply(change);
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
