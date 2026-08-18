# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY . .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Build the API and all of its workspace dependencies.
RUN pnpm --filter @company/api... build

# Produce a self-contained production deployment directory for the API.
RUN pnpm --filter @company/api --prod deploy --legacy /prod/api


FROM node:22-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build --chown=node:node /prod/api ./

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
