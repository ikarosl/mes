# 数据库首次初始化与演示数据

``` bash migration
docker compose \
  --project-name easy-mes \
  --env-file /etc/easy-mes/deploy.env \
  --env-file /opt/easy-mes/release.env \
  --file /opt/easy-mes/compose.prod.yml \
  run --rm --no-deps api \
  node node_modules/@company/database/dist/migrate.js
  
```

API 发布脚本负责执行 **migration**，但不会在每次部署时创建或重置管理员账号。首次环境初始化在 API migration 成功后手工执行 system seed 和 `bootstrap-admin`。

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
