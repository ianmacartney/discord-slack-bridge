import {
  type APIGuild,
  type APIGuildMember,
  type APIRole,
  PermissionFlagsBits as P,
  PermissionsBitField,
} from "discord.js";

const MODERATOR_PERMISSIONS = [
  P.Administrator,
  P.ManageGuild,
  P.KickMembers,
  P.BanMembers,
  P.ModerateMembers,
];

// A member's roles, plus @everyone (whose id is the server's).
const rolesOf = (guild: APIGuild, member: APIGuildMember) =>
  guild.roles.filter((r) => r.id === guild.id || member.roles.includes(r.id));

export const isModerator = (guild: APIGuild, member: APIGuildMember) =>
  new PermissionsBitField(
    rolesOf(guild, member).map((r) => BigInt(r.permissions)),
  ).any(MODERATOR_PERMISSIONS);

// Discord ranks roles by position, and the older role (smaller id) wins a tie.
const outranks = (a: APIRole, b: APIRole) =>
  a.position === b.position
    ? BigInt(a.id) < BigInt(b.id)
    : a.position > b.position;

const topRole = (guild: APIGuild, member: APIGuildMember) =>
  rolesOf(guild, member).reduce((top, r) => (outranks(r, top) ? r : top));

export const outranksMember = (
  guild: APIGuild,
  a: APIGuildMember,
  b: APIGuildMember,
) => outranks(topRole(guild, a), topRole(guild, b));
