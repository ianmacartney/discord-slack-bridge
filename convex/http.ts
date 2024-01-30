import { httpRouter } from "convex/server";
import { interactivityHandler, slashHandler } from "./slack";
import {
  registerAccountHandler,
  unregisterAccountHandler,
} from "./verification";

const http = httpRouter();

// Slack webhooks
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

// Custom webhooks to manage verified user status
http.route({
  path: "/discord/registerAccount",
  method: "POST",
  handler: registerAccountHandler,
});
http.route({
  path: "/discord/unregisterAccount",
  method: "POST",
  handler: unregisterAccountHandler,
});

// Convex expects the router to be the default export of `convex/http.js`.
export default http;
