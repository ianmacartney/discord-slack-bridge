FROM node:16-alpine AS builder

RUN curl -f https://get.pnpm.io/v6.16.js | node - add --global pnpm@7.27
WORKDIR /usr/src/app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod


FROM node:16-alpine

USER node
WORKDIR /usr/src/app
ARG TOKEN
ENV TOKEN=${TOKEN}
COPY --chown=node:node ./bot.js ./bot.js
COPY --from=builder /usr/src/app/node_modules /usr/src/app/node_modules

CMD [ "node", "bot.js" ]
