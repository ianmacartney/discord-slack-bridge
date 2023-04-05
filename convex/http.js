import { httpRouter } from "convex/server";
import { interactivityHandler, slashHandler } from "./slack";

const http = httpRouter();

// Define additional routes
http.route({
  path: "/slack/slash",
  method: "POST",
  handler: slashHandler,
});
http.route({
  path: "/slack/interactivity",
  method: "POST",
  handler: interactivityHandler,
});

// Convex expects the router to be the default export of `convex/http.js`.
export default http;
