FROM node:16 AS builder

RUN curl -f https://get.pnpm.io/v6.16.js | node - add --global pnpm@7.27
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod


FROM node:16-alpine

USER node
WORKDIR /usr/src/app
ARG TOKEN
ENV TOKEN=${TOKEN}
ARG CONVEX_URL="https://addicted-jackal-92.convex.cloud"
ENV CONVEX_URL=${CONVEX_URL}
COPY --chown=node:node ./discordBot.js ./discordBot.js
COPY --chown=node:node ./package.json ./package.json
COPY --chown=node:node ./shared/discordUtils.js ./shared/discordUtils.js
COPY --from=builder /usr/src/app/node_modules /usr/src/app/node_modules

CMD [ "node", "--es-module-specifier-resolution=node", "discordBot.js" ]
