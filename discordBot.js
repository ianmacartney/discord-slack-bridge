import { ChannelType, Client, GatewayIntentBits } from "discord.js";
import { ConvexHttpClient } from "convex/browser";

const convex = new ConvexHttpClient(process.env.CONVEX_URL);

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

bot.on("ready", () => {
  console.log(`Logged in as ${bot.user.tag}!`);
});

bot.on("messageCreate", (msg) => {
  let channel, thread;
  if (
    msg.channel.type === ChannelType.GuildForum ||
    msg.channel.type === ChannelType.PublicThread ||
    msg.channel.type === ChannelType.PrivateThread
  ) {
    thread = msg.channel.toJSON();
    delete thread["messages"];
    delete thread["members"];
    // thread: {
    //   id: '1092611054804140093',
    //   type: 11,
    //   guild: '1019350475847499849',
    //   guildId: '1019350475847499849',
    //   flags: 0,
    //   name: 'Trigger an action from a query?',
    //   parentId: '1088161997662724167',
    //   locked: false,
    //   invitable: null,
    //   archived: false,
    //   autoArchiveDuration: 4320,
    //   archiveTimestamp: 1680569175197,
    //   ownerId: '897754604790480906',
    //   lastMessageId: '1092621396355588106',
    //   lastPinTimestamp: null,
    //   rateLimitPerUser: 0,
    //   messageCount: 3,
    //   memberCount: 2,
    //   totalMessageSent: 3,
    //   appliedTags: [ '1088163362300514334' ],
    //   createdTimestamp: 1680569175197
    // }
    channel = msg.channel.parent.toJSON();
    delete channel["threads"];
    // channel: {
    //   id: '1088161997662724167',
    //   type: 15,
    //   guild: '1019350475847499849',
    //   guildId: '1019350475847499849',
    //   parentId: '1019350478817079336',
    //   permissionOverwrites: [ '1019350475847499849' ],
    //   flags: 0,
    //   name: 'support',
    //   rawPosition: 3,
    //   availableTags: [
    //     {
    //       id: '1088163318520356944',
    //       name: 'Bug Report',
    //       moderated: false,
    //       emoji: { id: null, name: '🪲' }
    //     },
    //     {
    //       id: '1088163362300514334',
    //       name: 'Feature Request',
    //       moderated: false,
    //       emoji: { id: null, name: '🎁' }
    //     },
    //     {
    //       id: '1088163440415219814',
    //       name: 'Advice',
    //       moderated: false,
    //       emoji: { id: null, name: '❔' }
    //     },
    //     {
    //       id: '1088163249410818230',
    //       name: 'Resolved',
    //       moderated: false,
    //       emoji: { id: null, name: '✅' }
    //     }
    //   ],
    //   defaultReactionEmoji: { id: null, name: '➕' },
    //   defaultThreadRateLimitPerUser: null,
    //   rateLimitPerUser: 60,
    //   defaultAutoArchiveDuration: null,
    //   nsfw: false,
    //   topic: 'Have a question? Seeing an issue? ...<truncated for brevity>',
    //   defaultSortOrder: null,
    //   defaultForumLayout: 1,
    //   createdTimestamp: 1679508437315
    // }
  } else {
    thread = undefined;
    channel = msg.channel.toJSON();
    delete channel["messages"];
  }
  const author = {
    id: msg.author.id, // '897754604790480906',
    // author fields
    userId: msg.author.id, // '897754604790480906',
    bot: msg.author.bot, // false,
    system: msg.author.system, // false,
    username: msg.author.username, // 'ianm',
    discriminator: msg.author.discriminator, // '8678',
    banner: msg.author.banner, // undefined,
    accentColor: msg.author.accentColor, // undefined,
    createdTimestamp: msg.author.createdTimestamp, // 1634111777256,
    defaultAvatarURL: msg.author.defaultAvatarURL, // 'https://cdn.discordapp.com/embed/avatars/3.png',
    hexAccentColor: msg.author.hexAccentColor, // undefined,
    tag: msg.author.tag, // 'ianm#8678',
    bannerURL: msg.author.bannerURL, // undefined
    // hybrid fields
    flags: msg.member.flags || msg.author.flags, // 0,
    avatar: msg.member.avatar ?? msg.author.avatar, // '43f79107277172b0539f3c4be5219b7a',
    avatarURL: msg.member.avatarURL ?? msg.author.avatarURL, // 'https://cdn.discordapp.com/avatars/897754604790480906/43f79107277172b0539f3c4be5219b7a.webp',
    // member fields
    guildId: msg.member.guild.id,
    memberId: msg.member.id,
    joinedTimestamp: msg.member.joinedTimestamp, // 1663305729175,
    nickname: msg.member.nickname, // 'Ian',
    pending: msg.member.pending, // false,
    displayName: msg.member.displayName, // 'Ian',
    roles: msg.member.toJSON().roles, // [ '1019375583387463710', '1019350475847499849' ],
    displayAvatarURL: msg.member.displayAvatarURL, // 'https://cdn.discordapp.com/avatars/897754604790480906/43f79107277172b0539f3c4be5219b7a.webp',
  };

  const message = {
    id: msg.id, // '1092512128818217083',
    channelId: msg.channelId, // '1088165062436458696',
    guildId: msg.guildId, // '1019350475847499849',
    createdTimestamp: msg.createdTimestamp, // 1680545589404,
    type: msg.type, // 0,
    system: msg.system, // false,
    content: msg.content, // '<@897754604790480906> hi',
    authorId: msg.authorId, // '897754604790480906',
    pinned: msg.pinned, // false,
    tts: msg.tts, // false,
    nonce: msg.nonce, // '1092512128113311744',
    embeds: msg.embeds, // [],
    components: msg.components, // [],
    attachments: msg.attachments, // [],
    stickers: msg.stickers, // [],
    position: msg.position, // 7,
    roleSubscriptionData: msg.roleSubscriptionData, // null,
    editedTimestamp: msg.editedTimestamp, // null,
    webhookId: msg.webhookId, // null,
    groupActivityApplicationId: msg.groupActivityApplicationId, // null,
    applicationId: msg.applicationId, // null,
    activity: msg.activity, // null,
    flags: msg.flags, // 0,
    reference: msg.reference, // null,
    interaction: msg.interaction, // null,
    cleanContent: msg.cleanContent, // '@Ian hi'
    mentions: msg.mentions.toJSON(), // {
    // everyone: false,
    // users: ['897754604790480906'],
    // roles: [],
    // crosspostedChannels: [],
    // repliedUser: null,
    // members: ['897754604790480906'],
    // channels: []
    // },
  };

  const args = {
    author,
    message,
    channel,
    thread,
  };
  convex.console.warn("upload to convex");
  convex.mutation("receiveDiscordMessage", args);
  console.log(args);
  // Upload to Convex
  for (const channel of channels) {
    // upload everything for now // seen.add(channel.id);
  }
  // upload everything for now // seen.add(msg.author.id);
});

bot.on("messageUpdate", (oldMsg, newMsg) => {
  const args = {
    previous: oldMsg.toJSON(),
    message: newMsg.toJSON(),
  };
  console.log("update message");
  console.log(args);
});

bot.on("messageDelete", (msg) => {
  const args = {
    message: msg.toJSON(),
  };
  console.log("delete message");
  console.log(args);
});

bot.on("threadUpdate", (oldThread, newThread) => {
  const args = {
    previous: oldThread.toJSON(),
    thread: newThread.toJSON(),
  };
  console.log("update thread");
  console.log(args);
});

bot.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("Pong!");
  }
});

const TOKEN = process.env.TOKEN;
if (!TOKEN) throw "Need TOKEN env variable";

await bot.login(TOKEN);
