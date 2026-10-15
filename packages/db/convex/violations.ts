export const VIOLATION_TIMEOUT_MINUTES = 24 * 60;
export const MOD_TIMEOUT_MINUTES = 7 * 24 * 60;

export const THRESHOLD_DEFAULTS = {
  spam: 0.95,
  nsfw_or_violent: 0.9,
  job_solicitation: 0.9,
  piracy_or_secrets: 0.9,
  fraud_or_illegal: 0.9,
  harassment: 0.9,
  ban: 0.95,
  dm_solicitation: 0.8,
  convex_self_promo: 0.9,
  needs_help: 0.8,
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
  mass_mention: "@everyone or @here used",
  discord_invite: "Invite to another Discord server",
};

export const isTeamRole = (name: string) =>
  ["convex", "convexteam"].includes(name.toLowerCase().replace(/[^a-z]/g, ""));

export const inviteCodes = (text: string) =>
  [
    ...text.matchAll(
      /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([\w-]+)/gi,
    ),
  ].map((m) => m[1]);
