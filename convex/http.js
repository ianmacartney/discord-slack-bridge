import { httpRouter } from "convex/server";
import { slackHandler } from "./slack";

const http = httpRouter();

// Define additional routes
http.route({
  path: "/slack",
  method: "POST",
  handler: slackHandler,
});

// Convex expects the router to be the default export of `convex/http.js`.
export default http;
