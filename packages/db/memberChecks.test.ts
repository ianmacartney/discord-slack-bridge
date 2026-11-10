import assert from "node:assert/strict";
import {
  ChannelType,
  PermissionFlagsBits as P,
  PermissionsBitField,
} from "discord.js";
import type {
  APIGuild,
  APIGuildMember,
  GuildTextBasedChannel,
} from "discord.js";
import {
  isModerator,
  isPublicChannel,
  outranksMember,
} from "./shared/memberChecks.ts";

const GUILD = "100";
const MEMBER = "101";
const MOD = "102";
const BOT = "103";
const ADMIN = "104";
const OLDER_TIED = "105";
const NEWER_TIED = "106";

const role = (id: string, position: number, permissions = 0n) => ({
  id,
  position,
  permissions: String(permissions),
});
const guild = (everyone = P.ViewChannel) =>
  ({
    id: GUILD,
    roles: [
      role(GUILD, 0, everyone),
      role(MEMBER, 1, P.SendMessages),
      role(MOD, 2, P.ModerateMembers),
      role(BOT, 3, P.BanMembers),
      role(ADMIN, 4, P.Administrator),
      role(OLDER_TIED, 5),
      role(NEWER_TIED, 5),
    ],
  }) as unknown as APIGuild;
const member = (...roles: string[]) => ({ roles }) as unknown as APIGuildMember;

assert.equal(isModerator(guild(), member()), false);
assert.equal(isModerator(guild(), member(MEMBER)), false);
assert.equal(isModerator(guild(), member(MEMBER, MOD)), true);
assert.equal(isModerator(guild(), member(ADMIN)), true);
assert.equal(isModerator(guild(P.KickMembers), member()), true);

assert.equal(outranksMember(guild(), member(BOT), member()), true);
assert.equal(outranksMember(guild(), member(BOT), member(MEMBER)), true);
assert.equal(outranksMember(guild(), member(BOT), member(BOT)), false);
assert.equal(outranksMember(guild(), member(BOT), member(ADMIN)), false);
assert.equal(
  outranksMember(guild(), member(BOT), member(ADMIN, MEMBER)),
  false,
);
assert.equal(
  outranksMember(guild(), member(OLDER_TIED), member(NEWER_TIED)),
  true,
);
assert.equal(
  outranksMember(guild(), member(NEWER_TIED), member(OLDER_TIED)),
  false,
);

const channel = (type: ChannelType, everyone: bigint | null) =>
  ({
    type,
    guild: { roles: { everyone: {} } },
    permissionsFor: () =>
      everyone === null ? null : new PermissionsBitField(everyone),
  }) as unknown as GuildTextBasedChannel;

assert.equal(
  isPublicChannel(channel(ChannelType.GuildText, P.ViewChannel)),
  true,
);
assert.equal(isPublicChannel(channel(ChannelType.GuildText, 0n)), false);
assert.equal(
  isPublicChannel(channel(ChannelType.PublicThread, P.ViewChannel)),
  true,
);
assert.equal(isPublicChannel(channel(ChannelType.PublicThread, 0n)), false);
assert.equal(isPublicChannel(channel(ChannelType.PublicThread, null)), false);
assert.equal(
  isPublicChannel(channel(ChannelType.PrivateThread, P.ViewChannel)),
  false,
);

console.log("memberChecks: all passed");
