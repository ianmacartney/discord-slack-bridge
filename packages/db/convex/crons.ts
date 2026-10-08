import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.daily(
  "Sync discord support threads with Algolia",
  { hourUTC: 8, minuteUTC: 17 },
  internal.algolia.index,
);
export default crons;
