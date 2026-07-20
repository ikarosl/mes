# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @company/admin-web... build

FROM nginx:1.27-alpine AS runtime
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin-web/dist /usr/share/nginx/html
EXPOSE 8080
