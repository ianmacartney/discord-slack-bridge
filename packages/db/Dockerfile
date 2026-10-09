FROM node:20 AS builder

RUN npm install -g pnpm@12.8.1
WORKDIR /usr/src/app
COPY package.json ./
# The build context is only this package, so the repo-root pnpm-workspace.yaml
# (and its allowBuilds list) isn't visible here. pnpm 12 fails on unapproved
# build scripts, so approve esbuild (pulled in by convex) explicitly.
RUN printf 'allowBuilds:\n  esbuild: true\n' > pnpm-workspace.yaml
RUN pnpm install --prod


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
