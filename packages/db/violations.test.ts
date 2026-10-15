import assert from "node:assert/strict";
import { inviteCodes } from "./convex/violations.ts";

assert.deepEqual(inviteCodes("join https://discord.gg/abc123 now"), ["abc123"]);
assert.deepEqual(
  inviteCodes("discord.com/invite/x-y and discordapp.com/invite/Z"),
  ["x-y", "Z"],
);
assert.deepEqual(inviteCodes("DISCORD.GG/Loud"), ["Loud"]);
assert.deepEqual(inviteCodes("see https://discord.com/channels/1/2"), []);
assert.deepEqual(inviteCodes("docs.convex.dev/invite/x"), []);
console.log("violations ok");
