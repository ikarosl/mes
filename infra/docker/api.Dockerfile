# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY . .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# 构建 API 及其全部工作区依赖。
RUN pnpm --filter @company/api... build

# 生成 API 的自包含生产部署目录。
RUN pnpm --filter @company/api --prod deploy --legacy /prod/api


FROM node:22-alpine AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build --chown=node:node /prod/api ./

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
