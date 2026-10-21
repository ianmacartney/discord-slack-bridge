import assert from "node:assert/strict";
import {
  inviteCodes,
  isRaidBait,
  isTeamRole,
  postFingerprint,
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

const images = (...sizes: number[]) => sizes.map((size) => ({ size }));
assert.equal(
  postFingerprint("", images(10, 20, 30)),
  postFingerprint("", images(30, 10, 20)),
);
assert.notEqual(
  postFingerprint("", images(10, 20)),
  postFingerprint("", images(10, 21)),
);
assert.equal(postFingerprint("hi"), null);
assert.equal(postFingerprint("scamlink.com"), "scamlink.com|");
assert.equal(postFingerprint("thanks!!"), null);
assert.equal(postFingerprint("hi", images(5)), "hi|5");
assert.equal(
  postFingerprint("Free  MrBeast giveaway, claim now!"),
  postFingerprint("free mrbeast giveaway, claim now!"),
);
assert.ok(isRaidBait("", images(1)));
assert.ok(isRaidBait("One key, all models | luoluocoder.com"));
assert.ok(isRaidBait("claim at https://example.org/x"));
assert.ok(!isRaidBait("my query returns undefined", images(1)));
assert.ok(!isRaidBait("my query returns undefined"));
