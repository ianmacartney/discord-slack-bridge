import assert from "node:assert/strict";
import {
  inviteCodes,
  isTeamRole,
  teamPingMinutes,
  teamPingTimesOut,
} from "./convex/violations.ts";

assert.deepEqual(inviteCodes("join https://discord.gg/abc123 now"), ["abc123"]);
assert.deepEqual(
  inviteCodes("discord.com/invite/x-y and discordapp.com/invite/Z"),
  ["x-y", "Z"],
);
assert.deepEqual(inviteCodes("DISCORD.GG/Loud"), ["Loud"]);
assert.deepEqual(inviteCodes("see https://discord.com/channels/1/2"), []);
assert.deepEqual(inviteCodes("docs.convex.dev/invite/x"), []);
console.log("violations ok");
assert.ok(
  isTeamRole("convex-team") &&
    isTeamRole("Convex Team") &&
    isTeamRole("convex_team"),
);
assert.ok(isTeamRole("convex") && isTeamRole("Convex"));
assert.ok(!isTeamRole("team") && !isTeamRole("convex-fan"));
assert.equal(teamPingMinutes(0, 0), 5);
assert.equal(teamPingMinutes(0.2, 1), 15);
assert.equal(teamPingMinutes(0.5, 0.1), 10);
// Scores Jev 1.14 gave on the dev server.
const abuse = { aggressive: 0.95, rude: 0.96, goodReason: 0.12, timeout: 0.38 };
const polite = {
  aggressive: 0.07,
  rude: 0.11,
  goodReason: 0.18,
  timeout: 0.12,
};
assert.ok(teamPingTimesOut(abuse, 0.8));
assert.ok(!teamPingTimesOut(polite, 0.8));
assert.ok(!teamPingTimesOut({ ...abuse, goodReason: 0.9 }, 0.8));
