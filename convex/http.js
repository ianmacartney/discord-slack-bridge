import { httpRouter } from "convex/server";
import { discordHandler, discordOauth2 } from "./discord";
import { slackHandler } from "./slack";

const http = httpRouter();

http.route({
  path: "/discord",
  method: "POST",
  handler: discordHandler,
});

http.route({
  path: "/discord/oauth2",
  method: "GET",
  handler: discordOauth2,
});

// Define additional routes
http.route({
  path: "/slack",
  method: "POST",
  handler: slackHandler,
});

// Convex expects the router to be the default export of `convex/http.js`.
export default http;
