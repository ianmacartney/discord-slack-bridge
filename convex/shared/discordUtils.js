export function serializeThread(discordThread) {
  const thread = discordThread.toJSON();
  delete thread["messages"];
  delete thread["members"];
  return thread;
}

export function serializeChannel(discordChannel) {
  const channel = discordChannel.toJSON();
  delete channel["threads"];
  return channel;
}

export function serializeMessage(msg) {
  return {
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
    flags: msg.flags.toJSON(), // 0,
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
}

export function serializeAuthor(msg) {
  return {
    id: msg.author.id, // '897754604790480906',
    // author fields
    userId: msg.author.id, // '897754604790480906',
    bot: msg.author.bot, // false,
    system: msg.author.system, // false,
    username: msg.author.username, // 'ianm',
    discriminator: msg.author.discriminator, // '8678',
    // banner: msg.author.banner, // undefined,
    // accentColor: msg.author.accentColor, // undefined,
    createdTimestamp: msg.author.createdTimestamp, // 1634111777256,
    defaultAvatarURL: msg.author.defaultAvatarURL, // 'https://cdn.discordapp.com/embed/avatars/3.png',
    // hexAccentColor: msg.author.hexAccentColor, // undefined,
    tag: msg.author.tag, // 'ianm#8678',
    // bannerURL: msg.author.bannerURL, // undefined
    // hybrid fields
    flags: msg.member.flags?.toJSON() || msg.author.flags?.toJSON(), // 0,
    avatar: msg.member.avatar ?? msg.author.avatar, // '43f79107277172b0539f3c4be5219b7a',
    avatarURL: msg.member.avatarURL() ?? msg.author.avatarURL(), // 'https://cdn.discordapp.com/avatars/897754604790480906/43f79107277172b0539f3c4be5219b7a.webp',
    // member fields
    guildId: msg.member.guild.id,
    memberId: msg.member.id,
    joinedTimestamp: msg.member.joinedTimestamp, // 1663305729175,
    nickname: msg.member.nickname, // 'Ian',
    pending: msg.member.pending, // false,
    displayName: msg.member.displayName, // 'Ian',
    roles: msg.member.toJSON().roles, // [ '1019375583387463710', '1019350475847499849' ],
    displayAvatarURL: msg.member.displayAvatarURL(), // 'https://cdn.discordapp.com/avatars/897754604790480906/43f79107277172b0539f3c4be5219b7a.webp',
  };
}
