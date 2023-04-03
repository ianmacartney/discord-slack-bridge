import fetch from "node-fetch";
import { action } from "../_generated/server";

export const exchangeCode = action(async ({}, { code }) => {
  console.log({ action: true, code });
  const tokenResponseData = await fetch(
    "https://discord.com/api/oauth2/token",
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: process.env.CONVEX_SITE_URL + "/discord/oauth2",
        scope: "identify bot messages.read",
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  const oauthData = await tokenResponseData.json();
  if (oauthData.access_token) {
    const userResp = await fetch("https://discord.com/api/users/@me", {
      headers: {
        authorization: `${oauthData.token_type} ${oauthData.access_token}`,
      },
    });
    const user = await userResp.json();
    oauthData.user = user;
  }
  return oauthData;
});

export const refreshToken = action(async ({}, {}) => {});
