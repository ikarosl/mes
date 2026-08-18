## 初始化工作

**本文最后一段是数据库初始化引导，这个需要手动执行** 详见最后一段 **这个会初始化管理员的密码 初始化请不要使用**

**请注意：** bash ops/scripts/install-easy-mes-compose 该脚本会初始化所有配置文件
对于/etc/easy-mes 下这是持久化配置,**不会覆盖**
对于/opt/easy-mes 这是随版本更新的配置,**将会进行覆盖**

如果服务器为进行相关配置，请上传仓库最小安装引导,**指的是当前项目仓库的这些文件**：

```
infra/compose/compose.prod.yml
ops/config/etc/easy_mes/*.env.example
```

上传一个最小引导包，保持仓库目录结构,（实际可以直接上传infra和ops到服务器内）：

```
    easy-mes-bootstrap/
    ├── infra/
    │   └── compose/
    │       └── compose.prod.yml
    └── ops/
        ├── scripts/
        │   ├── install-easy-mes-compose
        │   ├── deploy-api.sh
        │   ├── deploy-web.sh
        │   └── apply-control.sh
        └── config/
            └── etc/
                └── easy_mes/
                    ├── api.env.example
                    ├── deploy.env.example
                    ├── mysql.env.example
                    └── minio.env.example
```

上传到服务器的临时目录，例如： /tmp/easy-mes-bootstrap/
然后以管理员身份执行：

```
    cd /tmp/easy-mes-bootstrap
    sudo bash ops/scripts/install-easy-mes-compose
```

安装脚本会负责：
创建 /opt/easy-mes
创建 /etc/easy-mes
创建 /srv/easy-mes 持久化目录
设置目录所有者和权限
把脚本安装为 755
把 Compose 安装为 644
仅在配置不存在时复制配置模板

---

## 服务器目录规划

下面这些配置均为**服务器内**持久化的各服务配置项,服务器目录规划如下：

```
# 可变配置项
/opt/easy-mes/
├── compose.prod.yml
├── deploy-api.sh
├── deploy-web.sh
├── apply-control.sh
└── release.env

# 手动配置项
/etc/easy-mes/
├── api.env
├── mysql.env
├── minio.env
├── deploy.env
└── minio.license

# 服务数据持久化
/srv/easy-mes/
├── mysql/
├── minio/
├── backups/
│   ├── mysql/
│   └── minio/
└── nginx-logs/
```

## 需确定配置

### nginx、compose 配置

服务器防火墙对外暴露实际的端口，然后由dokcer 将宿主机端口映射到
web服务的容器（web服务容器本身是一个nginx 服务），nginx监听docker 容器内映射的端口，
对于api的请求转发到容器的网络。
那么docker compose 设置了宿主机端口映射到 web容器端口

首先：
web服务实际就是nginx 监听端口，那么：
docker compose 端口映射**到容器内的端口**与nginx conf 监听端口要一致（最好 infra\docker\web.Dockerfile.EXPOSE 也要一致），
也就是infra\compose\compose.prod.yml.services.web.ports（右侧映射）、 infra\nginx\default.conf.lisent、 infra\docker\web.Dockerfile.EXPOSE

然后nginx 转发内部api 服务端口要与api 服务的实际监听端口一致（最好 infra\docker\api.Dockerfile.EXPOSE 也要一致），
也就是\etc\api.env.APP_PORT（这是node 服务启动使用的配置）、infra\nginx\default.conf、infra\docker\api.Dockerfile（不强制但有提醒）

### 服务器 配置项对齐（待补充）

## 数据库初始化引导

首次数据库初始化，（**请确保ci cd流程自动完成后执行**）：

1. migration：CD 已自动执行。
2. system seed：需要首次手动执行，创建管理员角色和权限。
3. bootstrap-admin：需要首次手动执行，创建管理员用户。

不应在每次 CD 中自动执行 `bootstrap-admin`，因为重复执行会按环境变量重置管理员密码。

先以 root 执行 system seed：

```bash
docker compose \
  --project-name easy-mes \
  --env-file /etc/easy-mes/deploy.env \
  --env-file /opt/easy-mes/release.env \
  --file /opt/easy-mes/compose.prod.yml \
  run --rm --no-deps api \
  node node_modules/@company/database/dist/seed.js
```

然后安全输入管理员密码，不把密码写进命令历史：

```bash
read -rsp '请输入管理员密码: ' ADMIN_PASSWORD
echo
export ADMIN_PASSWORD
export ADMIN_USERNAME=admin
export ADMIN_DISPLAY_NAME='系统管理员'
```

执行管理员初始化：

```bash
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
```

成功时会显示：

```text
Administrator ready: admin
```

立即清除当前 Shell 中的密码：

```bash
unset ADMIN_PASSWORD ADMIN_USERNAME ADMIN_DISPLAY_NAME
```

然后查询：

```sql
SELECT id, username, display_name, status FROM users;
```

system seed 可以幂等重跑；`bootstrap-admin` 也能重跑，但会重置该管理员的密码，所以后续不要把它放进普通 CD。
