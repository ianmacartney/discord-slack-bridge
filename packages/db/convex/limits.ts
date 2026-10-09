import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

const limiter = new RateLimiter(components.rateLimiter, {
  // One "please elaborate in a thread" reply per person every 30 minutes. A bucket of 1 means the next reply is only
  helpFollowUp: {
    kind: "token bucket",
    rate: 1,
    period: 30 * MINUTE,
    capacity: 1,
  },
});

type LimitName = keyof NonNullable<typeof limiter.limits>;;

/** Uses up one token for this person. `ok` is false when they're over the limit. */
export function limitPerPerson(
  ctx: Parameters<typeof limiter.limit>[0],
  name: LimitName,
  discordUserId: string,
) {
  return limiter.limit(ctx, name, { key: discordUserId });
}
