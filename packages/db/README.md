# Discord Slack Bridge with Convex

Sync messages & threads from Discord into Slack.
It will turn Discord threads into Slack threads, replying in the right thread on
new messages.

My usecase is to mirror our "#support" forum in Discord into a Slack channel, so
folks here don't have to periodically switch from Slack to Discord to scan, and
which allows us to discuss and reference and search support threads in slack.

## What the bot does

- **Mirrors support threads to Slack** so the team can answer without watching Discord (see below).
- **Classifies every message** with Jev (normal, needs help, spam, NSFW, job posts, piracy, harassment, …).
- **Handles rule violations.** Spam, NSFW, job posts, piracy and `@everyone` / `@here` are deleted, the person is
  timed out for a day, and a card in the mod channel offers Ban, Kick, Timeout (7 days), Warn and Dismiss.
- **Forwards help requests.** A long, worried question in the chat channel gets 👀, its own post in the support
  forum (quoting the message) and a reply linking to it. When the post is resolved, the original gets 👍.
- **Auto-tags new support posts** with a type and an area. A card in the mod channel has Undo and Edit buttons.

Moderation never acts on the server owner, admins, moderators or bots. Until `MODERATION_DRY_RUN` is set to `false`,
it only records what it would do and says "(dry run)" on its cards.

### Moderator commands

Reply to someone's message with one of these. The command message is deleted and the result shows up in the mod
channel.

| Command | What it does | Needs |
| --- | --- | --- |
| `!forward` | Opens a support post from the message (any channel, no AI check) | Manage Messages |
| `!ban r="reason" d=7` | Bans the author and deletes `d` days of their messages (0 to 7) | Ban Members |
| `!timeout r="reason" t=1h` | Times the author out (`10m`, `1h`, `2d`, up to 28 days, default 1 hour) | Moderate Members |

`r` is optional everywhere.

### Slash commands

| Command | What it does |
| --- | --- |
| `/modchannel set \| clear \| status` | The private channel for cards and logs (admins) |
| `/forwardfrom set channel:#general to:#support` | Where help requests are watched and where their posts open. `clear`, `status` |
| `/tags forum \| clear-forum` | The support forum that gets auto-tagged |
| `/tags add name kind when emoji` | Adds a forum tag and tells Jev when to use it (`kind`: type or area) |
| `/tags edit tag new_name when emoji` | Renames a tag, changes its emoji or when Jev uses it |
| `/tags delete tag tag_2 … tag_5` | Removes up to five tags (names are suggested as you type) |
| `/tags delete-all` | Removes every tag except Resolved, after you confirm |

Every settings change posts a "Settings changed" card in the mod channel. All slash commands need Manage Messages,
except `/modchannel` (Administrator).

### Setting it up in a server

1. Invite the bot with these permissions: View Channels, Send Messages, Send Messages in Threads, Create Posts, Read
   Message History, Add Reactions, Embed Links, Manage Messages, Manage Threads, Manage Channels, Moderate Members,
   Kick Members, Ban Members. Put its role above the members it should moderate.
2. In the Developer Portal, turn on the **Message Content** and **Server Members** intents, and turn off **Public
   Bot** so only you can add it.
3. `/modchannel set channel:#mods`
4. `/forwardfrom set channel:#general to:#support`
5. `/tags forum channel:#support`, then `/tags add` for each tag Jev should use.

### Confidence thresholds

How sure Jev must be before the bot acts lives in `THRESHOLD_DEFAULTS` in `convex/violations.ts` (spam 0.95, other
violations 0.9, help requests 0.8, tags 0.7).

## Installation

### 1. Convex backend

To run it against your own backend:

```
npx convex dev
```

### 2. Configure Discord

1. Create a discord bot and authorize it, adding it to your server / guild.
2. Copy the token and save it in the environment variables in the dashboard
   with the key DISCORD_TOKEN. `npx convex dashboard` to get there.

### 3. Configure Slack

1. Create a slack app and install it into your workspace.
2. Copy the bot oauth token and save it in the convex environment variables as
   SLACK_TOKEN.

### 4. discordBot.js (on fly.io)

You can run the discordBot that connects to discord and sends changes to Convex
locally to test, then deploy it to fly.io.

**Locally:**

```
pnpm i
export DISCORD_TOKEN=<discord-token>
export CONVEX_URL=<deployment-URL-from-.env.local>
export CONVEX_API_TOKEN=<some-shared-secret>
export AUTO_REPLY_CHANNEL_ID=1088161997662724167 # for us in prod rn
export DISCORD_RESOLVED_TAG_ID=1088163249410818230 # for us in prod rn
npm run discordBot
```

The bot needs Node 20 or newer.

**Convex environment variables** (set them in the dashboard; the deploy fails without the required ones):

| Variable | Required | Purpose |
| --- | --- | --- |
| `CONVEX_API_TOKEN` | yes | Shared secret the bot sends with every call |
| `DISCORD_TOKEN` | yes | Bot token, for the actions that post and moderate |
| `DISCORD_RESOLVED_TAG_ID` | yes | The forum tag the Resolve button applies |
| `SLACK_TOKEN` | yes | Slack bot token |
| `MODERATION_DRY_RUN` | no | Set to `false` to let moderation really act. Anything else is dry-run |
| `MOD_CHANNEL_ID` | no | Fallback mod channel when `/modchannel` isn't set |
| `MODERATION_EXEMPT_USER_IDS` | no | Comma-separated user ids moderation never touches |
| `MODERATION_ALLOW_BOT_TARGETS` | no | `true` only for testing with bot accounts as targets |
| `AUTO_REPLY_CHANNEL_ID` | no | Support forum for the auto-reply on new posts |
| `ALGOLIA_API_KEY`, `VERIFICATION_*` | no | Search indexing and account verification (below) |

**In Docker:**

```
npm run dockerBotBuild
npm run dockerBot
npm run clean && npm run build
```

**Deploy the discordBot.js to fly.io:**

Normal deploy:

`npm run flyDeploy`

Installation / configuration:

1. Install flyctl, e.g. `brew install flyctl`
2. Build it with `npm run build`
3. Deploy it the first time with `fly launch`. After first: `npm run flyDeploy`

4. Set the environment variables for it with:
   fly secrets set DISCORD_TOKEN=<discord-token>
   fly secrets set CONVEX_URL=<deployment-URL>
   fly secrets set CONVEX_API_TOKEN=<shared-token>
   fly secrets set AUTO_REPLY_CHANNEL_ID=<resolved-tag-id>
   fly secrets set DISCORD_RESOLVED_TAG_ID=<resolved-tag-id>

I just chose one instance in sjc, on the smallest (free) tier.
I did have to enter my CC info, but it hasn't been charged.

### 5. Mapping Discord channels to Slack

Once messages are coming in, you'll see the channels listed in the Convex
dashboard. You can edit a given channel and add `slackChannelId: "C0123456ABC"`
for your corresponding slack channel IDs. Then, new messages will get posted to
Slack, only for the Discord channels you want. Hooray!

## Backfill

You can backfill a discord channel by copying the channel ID and going to the
Convex dashboard, going to the "functions" section, and finding
discord_node / backfillDiscordChannel .
Run it with a single parameter: `{ discordId: "1111111111111111111" }`
replacing the 1's with your discord ID.

Tip: In discord you can right-click various things and click "Copy ID"

I chose not to have this send these all to Slack, but instead just backfill into
the database. Doing it multiple times won't duplicate data, it won't overwrite
anything that already exists (unique on discord "id" field). If you wanted,
you could have it send the slack messages, but you'd probably want to make sure
you iterate over all the messages in order, so they're in order in Slack too.

For me, I just wanted the thread names and content to be in my DB for future
reference, e.g. to index it for search or train GPT.

## Debugging

- You can look at your discordBot.js logs in the fly.io dashboard under monitoring.
- You can see your convex functions in the convex dashboard under Logs
- You might run into issues where your bots need extra permissions and you need
  to re-install them into the workspace / guild to get the right oauth token.
- The discord bot doesn't catch updates to messages sent before it started
  up, but going forward, message updates / deletes should be sent along to slack.
  There's a `discord-logs` npm package that adds more events we could listen to
  in discordBot.js, maybe `unhandledMessageUpdate` would be useful?
  If you do that, send a PR please 🙏.

## Search indexing

This repository also includes a cron job that ensures the appropriate discord
threads are indexed into Algolia for use in search. By default, this job
scans every minute for updated threads that may be eligible for indexing.

Don't worry! By default nothing is being indexed. But... what if you want
to start indexing in your installation? Here's how it's done:

1.  Add ALGOLIA_API_KEY to the deployment environment
2.  Set a boolean field called `indexForSearch` to `true` on any channel records
    that are appropriate. Typically this will just be the support forum channel.
3.  To reset the thread index scanning cursor, go into the `threadSearchStatus`
    table and update the `indexedCursor` number field to 0. This will ensure all
    threads get re-scanned for indexing eligibility

After that, any new or updated discord threads in the appopriate channel(s) will
be added to the Algolia index within a minute. If you ever change the document
structure, or for any other reason want to trigger a complete re-indexing of
Algolia, just repeat step (3) above and set the cursor back to zero.

## Verification

There is code in `convex/verification[_node].ts` to handle authenticating a Discord
user with another bot. For Convex Community, this is the Convex Verification bot.
When a user logs into Convex and associates their Discord account, we capture
their userId here, and grant them a role. For this to work, the bot has to be installed with
scope to "Manage Roles" as well as "identity" and "email" to be able to authenticate.
It handles this via the `/discord/[un]registerAccount` http endpoints.

This uses a few environment variables:

- VERIFICATION_WEBHOOK_TOKEN: This is the shared secret between the Convex backend
  and this backend to authenticate requests.
- VERIFICATION_DISCORD_TOKEN: This is the Convex Verification bot token, from the
  [Discord developer portal](https://discord.com/developers/applications).
- VERIFICATION_GUILD_ID: This is the server ID where it will grant a role.
- VERIFICATION_ROLE_ID: The role it will grant, e.g. "Verified".

## Extras

It has some code to handle slash commands, interactions, etc.
To do this, set the URL in slack to be
"https://<project-slug>.convex.site/slack/slash" for slash commands, or
"https://<project-slug>.convex.site/slack/interactivity" for interactions.
The slug is the part of the url in your deployment URL before `convex.cloud`.
E.g. https://happy-iguana-123.convex.site/slack/slash .
Notice the `.convex.site`! This is the http handlers, defined in convex/http.js.

Currently I have two shortcuts configured from slack: resolve & reply,
configured as "message" shortcuts. So you can right-click a message and send a
reply to Discord.

- For resolve, you'll need to update the code to pass the
  right Tag ID. For us, we have a tag in our support channel for "Resolved".
- For reply, you can add your `slackUserId: "U01234ABCDE",` in the `users`
  table. It won't reply as you, but it'll tag you in the reply.

Tip: you can get all your slack users & ids by running:

```
$ node

const token = <your slack token>;
const {WebClient} = require('@slack/web-api');
const web = new WebClient(token);
const users = await web.users.list();
users.members.map(m => `${m.real_name || m.name}: ${m.id}`)
```

There isn't bidirectional syncing - sending slack messages don't go to Discord.
They could, but we find it's better to chat in slack between coworkers, and
then go and message in Discord directly (which gets synced to slack).

## Brand colors

The Discord cards the bot posts in the mod channel use the Convex brand colors. They are defined once, in
`convex/brandColors.ts`:

| Color | Hex | Used for |
| --- | --- | --- |
| Purple | `#8D2676` | A setting turned on or added, auto-tag notes, and "Message forwarded to support" cards |
| Yellow | `#F3B01C` | A setting turned off, cleared or moved, and dry-run cards |
| Red | `#EE342F` | Live moderation proposals |

Code asks for a meaning (`CARD_COLOR.added`, `.removed`, `.danger`) and never a hex value, so changing a color is a
one-line edit in that file.
