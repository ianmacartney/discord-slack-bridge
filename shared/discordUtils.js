export function serializeThread(discordThread) {
  const thread = discordThread.toJSON();
  delete thread["messages"];
  delete thread["members"];
  return thread;
}

export function serializeChannel(discordChannel) {
  const channel = discordChannel.toJSON();
  delete channel["threads"];
  delete channel["messages"];
  return channel;
}

export function serializeMessage(msg) {
  return msg.toJSON();
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
    flags: msg.member?.flags?.toJSON() || msg.author.flags?.toJSON() || 0, // 0,
    avatar: msg.member?.avatar ?? msg.author.avatar, // '43f79107277172b0539f3c4be5219b7a',
    avatarURL: msg.member?.avatarURL() ?? msg.author.avatarURL(), // 'https://cdn.discordapp.com/avatars/897754604790480906/43f79107277172b0539f3c4be5219b7a.webp',
    // member fields
    guildId: msg.member?.guild.id,
    memberId: msg.member?.id,
    joinedTimestamp: msg.member?.joinedTimestamp, // 1663305729175,
    nickname: msg.member?.nickname, // 'Ian',
    pending: msg.member?.pending, // false,
    displayName: msg.member?.displayName, // 'Ian',
    roles: msg.member?.toJSON().roles || [], // [ '1019375583387463710', '1019350475847499849' ],
    displayAvatarURL: msg.member?.displayAvatarURL(), // 'https://cdn.discordapp.com/avatars/897754604790480906/43f79107277172b0539f3c4be5219b7a.webp',
  };
}
