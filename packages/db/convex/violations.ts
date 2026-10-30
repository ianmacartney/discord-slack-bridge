export const VIOLATION_TIMEOUT_MINUTES = 24 * 60;
export const MOD_TIMEOUT_MINUTES = 7 * 24 * 60;

export const THRESHOLD_DEFAULTS = {
  spam: 0.85,
  nsfw_or_violent: 0.9,
  job_solicitation: 0.9,
  piracy_or_secrets: 0.9,
  fraud_or_illegal: 0.9,
  harassment: 0.9,
  ban: 0.95,
  dm_solicitation: 0.8,
  convex_self_promo: 0.9,
  raid: 0.8,
  needs_help: 0.8,
  team_ping: 0.8,
  tag: 0.5,
};
export type ThresholdName = keyof typeof THRESHOLD_DEFAULTS;

export const CLASSIFIED_VIOLATIONS = [
  "spam",
  "nsfw_or_violent",
  "job_solicitation",
  "piracy_or_secrets",
  "fraud_or_illegal",
] as const;

export const VIOLATION_TITLES: Record<string, string> = {
  spam: "Spam detected",
  nsfw_or_violent: "NSFW, violent or doxxing content detected",
  job_solicitation: "Job solicitation detected",
  piracy_or_secrets: "Piracy or leaked keys detected",
  fraud_or_illegal: "Fraud or illegal activity detected",
  dm_solicitation: "Support outside the dashboard or community-support",
  raid: "Spam raid across channels",
  mass_mention: "@everyone or @here used",
  discord_invite: "Invite to another Discord server",
};

// 5 minutes for a mild ping, up to 15 for an aggressive or rude one.
export const teamPingMinutes = (aggressive: number, rude: number) =>
  Math.round(5 + 10 * Math.max(aggressive, rude));

// Jev hesitates on "should they be timed out" even for abuse, so aggressive or rude alone is enough.
export const teamPingTimesOut = (
  s: { aggressive: number; rude: number; goodReason: number; timeout: number },
  min: number,
) => s.goodReason < min && Math.max(s.aggressive, s.rude, s.timeout) >= min;

export const SUPPORT_RULE =
  "Support happens in the Convex dashboard (support tickets) or in the community-support forum. " +
  "The Convex team never asks anyone to go to another server, open a ticket anywhere else, get help in DMs, " +
  "pay for support, or install extra software, and never tries to mislead anyone.";

export const RAID_WINDOW_MS = 2 * 60_000;
export const CROSS_POST_CHANNELS = 2;
const MIN_FINGERPRINT_TEXT = 20;
const LINK =
  /https?:\/\/|www\.|\b[\w-]+\.(com|net|org|io|xyz|gg|me|app|site|top|shop|online|link|ru|cn)\b/i;

/**
 * The same post twice gets the same fingerprint, whatever the file names or image order. Null for posts too thin to
 * judge: short text with no image and no link.
 */
export const postFingerprint = (
  content: string,
  attachments: { size: number }[] = [],
) => {
  const text = content.toLowerCase().replace(/\s+/g, " ").trim();
  if (
    !attachments.length &&
    text.length < MIN_FINGERPRINT_TEXT &&
    !LINK.test(text)
  ) {
    return null;
  }
  const sizes = attachments.map((a) => a.size).sort((a, b) => a - b);
  return `${text}|${sizes.join(",")}`;
};

/** Image-only posts and links: what spam raids are made of. */
export const isRaidBait = (
  content: string,
  attachments: { size: number }[] = [],
) => (!content.trim() && attachments.length > 0) || LINK.test(content);

export const isTeamRole = (name: string) =>
  ["convex", "convexteam"].includes(name.toLowerCase().replace(/[^a-z]/g, ""));

export const inviteCodes = (text: string) =>
  [
    ...text.matchAll(
      /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([\w-]+)/gi,
    ),
  ].map((m) => m[1]);
