# Discord Slack Bridge with Convex

Sync messages & threads from Discord into Slack.
It will turn Discord threads into Slack threads, replying in the right thread on
new messages.

My usecase is to mirror our "#support" forum in Discord into a Slack channel, so
folks here don't have to periodically switch from Slack to Discord to scan, and
which allows us to discuss and reference and search support threads in slack.

## Installation

```
pnpm i
```

### Configure backend

```
cd packages/db
```

Then follow the [README there](./packages/db/README.md).

### Running the dashboard

```
npm run dev
```
