import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();
crons.interval(
  "Sync discord support threads with Algolia",
  { minutes: 1 }, // Every minute
  api.actions.algolia.index
);
export default crons;
