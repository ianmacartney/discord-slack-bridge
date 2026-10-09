FROM node:20 AS builder

RUN npm install -g pnpm@12.8.1
WORKDIR /usr/src/app
COPY package.json ./
# esbuild (via convex) is only needed by the convex CLI, not the bot at runtime
RUN pnpm install --prod --ignore-scripts


FROM node:20-alpine

USER node
WORKDIR /usr/src/app
ARG DISCORD_TOKEN
ENV DISCORD_TOKEN=${DISCORD_TOKEN}
ARG CONVEX_URL
ENV CONVEX_URL=${CONVEX_URL}
ARG CONVEX_API_TOKEN
ENV CONVEX_API_TOKEN=${CONVEX_API_TOKEN}
COPY --chown=node:node ./dist ./
COPY --chown=node:node ./package.json ./package.json
COPY --from=builder /usr/src/app/node_modules /usr/src/app/node_modules

CMD [ "node", "discordBot.js" ]
