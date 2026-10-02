// Rule violations that get the full treatment: the message is deleted, the person is timed out for a day, and a
// card with action buttons is posted in the mod channel. Pure data with no Convex imports, shared by the policy and
// the cards.

/** How long the automatic timeout lasts. */
export const VIOLATION_TIMEOUT_MINUTES = 24 * 60;
/** The Timeout button on a card applies a longer one. */
export const MOD_TIMEOUT_MINUTES = 7 * 24 * 60;

/**
 * How confident Jev must be before the bot acts. Moderators change these with /confidence (see thresholds.ts).
 * The first four are the violations that get the full treatment (delete, timeout, card).
 */
export const THRESHOLD_DEFAULTS = {
  spam: 0.95,
  nsfw_or_violent: 0.9,
  job_solicitation: 0.9,
  piracy_or_secrets: 0.9,
  harassment: 0.9, // deleted, with a proposed timeout
  needs_help: 0.8, // gets the follow-up reply
  tag: 0.7, // forum auto-tagging
};
export type ThresholdName = keyof typeof THRESHOLD_DEFAULTS;

/** Classifier categories (see MESSAGE_CATEGORIES in classify.ts) that count as violations. */
export const CLASSIFIED_VIOLATIONS = [
  "spam",
  "nsfw_or_violent",
  "job_solicitation",
  "piracy_or_secrets",
] as const;

/** Card titles, including the one violation that isn't classified: @everyone / @here. */
export const VIOLATION_TITLES: Record<string, string> = {
  spam: "Spam detected",
  nsfw_or_violent: "NSFW, violent or doxxing content detected",
  job_solicitation: "Job solicitation detected",
  piracy_or_secrets: "Piracy or leaked keys detected",
  mass_mention: "@everyone or @here used",
};
