import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
if (process.env.ALGOLIA_API_KEY) {
  crons.interval(
    "Sync discord support threads with Algolia",
    { minutes: 1 }, // Every minute
    internal.algolia.index
  );
}
export default crons;
