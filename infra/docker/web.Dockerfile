# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @company/admin-web build

FROM nginx:1.27-alpine AS runtime
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin-web/dist /usr/share/nginx/html
# EXPOSE 仅为文档元数据（docker ps / docker run -P 参考），不实际发布端口。
# 值必须与 infra/nginx/default.conf 的 listen 一致，并同步 compose.prod.yml
# 中 web 端口映射的容器侧端口；宿主机侧端口由 deploy.env 的 HTTP_PORT 决定，与此无关。
EXPOSE 8091
