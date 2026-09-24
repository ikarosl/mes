# 数据库首次初始化与演示数据

API 发布脚本只执行 migration 和 Bucket 初始化，不在每次部署时创建或重置管理员。首次初始化在 migration 成功后依次执行 system seed、管理员初始化；演示数据必须单独启用。已有库正常升级不要求清空数据。

## 可选：重建开发／测试库

仅在需要完全重置开发／测试库时使用本节。先停止整个 Compose 栈，将已停止的 MySQL 数据目录保留到备份位置，再创建空目录；原数据不会迁移进新库。已有数据目录不会因修改初始化环境变量而更新数据库账号密码，重建后使用 `/etc/easy-mes/mysql.env` 的配置初始化。

以下命令在测试服务器以具备目录与 Docker 权限的账号执行。服务目录与备份边界见[部署手册](compose-server-deployment.md)；此处保留旧目录不是自动备份或已验证恢复能力。

```bash
compose=(
  docker compose
  --project-name easy-mes
  --env-file /etc/easy-mes/deploy.env
  --env-file /opt/easy-mes/release.env
  --file /opt/easy-mes/compose.prod.yml
)

"${compose[@]}" down
reset_stamp="$(date +%Y%m%d-%H%M%S)"
mv -- /srv/easy-mes/mysql "/srv/easy-mes/backups/mysql/reset-${reset_stamp}"
install -d -o 999 -g 999 -m 750 /srv/easy-mes/mysql
"${compose[@]}" up -d --wait mysql
```

需要检查新账号时交互式登录，避免密码进入命令历史：

```bash
"${compose[@]}" exec mysql mysql -uroot -p
```

空库使用当前 API 镜像应用迁移，再继续下方 seed 和管理员初始化：

```bash
"${compose[@]}" run --rm --no-deps api \
  node node_modules/@company/database/dist/migrate.js
```

## System seed

```bash
docker compose \
  --project-name easy-mes \
  --env-file /etc/easy-mes/deploy.env \
  --env-file /opt/easy-mes/release.env \
  --file /opt/easy-mes/compose.prod.yml \
  run --rm --no-deps api \
  node node_modules/@company/database/dist/seed.js
```

System seed 不含账号凭证，可以幂等重跑。

## 管理员初始化

在交互式 Shell 中读取密码，避免进入命令历史：

```bash
read -rsp '请输入管理员密码: ' ADMIN_PASSWORD
echo
export ADMIN_PASSWORD
export ADMIN_USERNAME=admin
export ADMIN_DISPLAY_NAME='系统管理员'
docker compose \
  --project-name easy-mes \
  --env-file /etc/easy-mes/deploy.env \
  --env-file /opt/easy-mes/release.env \
  --file /opt/easy-mes/compose.prod.yml \
  run --rm --no-deps \
  -e ADMIN_USERNAME \
  -e ADMIN_PASSWORD \
  -e ADMIN_DISPLAY_NAME \
  api \
  node node_modules/@company/database/dist/bootstrap-admin.js

unset ADMIN_PASSWORD ADMIN_USERNAME ADMIN_DISPLAY_NAME
```

`bootstrap-admin` 可以重跑，但会按当前环境变量重置该管理员密码，因此不得加入普通 CD。

## 可选演示数据

演示或联调环境可以在 **migration 和 system seed** 后显式执行；正式生产数据库禁止执行：

```bash
read -rsp '请输入演示账号密码（至少 6 位）: ' DEMO_USER_PASSWORD
echo
export DEMO_USER_PASSWORD

docker compose \
  --project-name easy-mes \
  --env-file /etc/easy-mes/deploy.env \
  --env-file /opt/easy-mes/release.env \
  --file /opt/easy-mes/compose.prod.yml \
  run --rm --no-deps \
  -e NODE_ENV=development \
  -e ALLOW_DEMO_SEED=1 \
  -e DEMO_USER_PASSWORD \
  api \
  node node_modules/@company/database/dist/seed-demo.js

unset DEMO_USER_PASSWORD
```

Demo seed 按业务编码幂等更新，不删除其他业务数据；`admin` 管理员仍由 `bootstrap-admin` 单独创建。
