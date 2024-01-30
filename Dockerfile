FROM node:16 AS builder

RUN curl -f https://get.pnpm.io/v6.16.js | node - add --global pnpm@7.27
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod


FROM node:16-alpine

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
