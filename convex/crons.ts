import { cronJobs } from "./_generated/server";

const crons = cronJobs();
crons.interval(
  "Sync discord support threads with Algolia",
  { minutes: 1 }, // Every minute
  "actions/algolia:index"
);
export default crons;
