# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @company/admin-web build

FROM nginx:1.27-alpine AS runtime
# 构建时只保存模板和默认值，实际端口由 Compose 在创建容器时传入。
ENV WEB_LISTEN_PORT=8091 \
    API_PORT=3000 \
    HTTPS_PORT=8091 \
    NGINX_ENVSUBST_FILTER="^(WEB_LISTEN_PORT|API_PORT|TLS_SERVER_NAME|HTTPS_PORT)$"
COPY infra/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/admin-web/dist /usr/share/nginx/html
# 保留官方启动入口：替换允许的变量后生成 HTTPS 配置，再启动 Nginx；启动前必须准备证书。
# 只替换上面指定的环境变量，保留模板中的 $uri、$host 等 Nginx 请求变量。
# 此处仅描述默认端口；实际监听、端口映射及健康检查均由 deploy.env 中的配置协调。
EXPOSE 8091 443
