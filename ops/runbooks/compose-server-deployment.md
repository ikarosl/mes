# Docker Compose 测试服务器部署

`infra/compose/compose.prod.yml` 在单机测试服务器运行 MySQL、MinIO、API 和承载管理端的 Nginx。业务流量通过 Nginx HTTPS 入口进入，默认公网端口为 `8091`；公网 `80` 用于证书验证和 HTTPS 跳转。MySQL 和 MinIO 控制台分别通过宿主机 `13306`、`19001` 端口供维护人员访问；MinIO S3 API 和应用 API 不发布宿主机端口，服务之间通过 Compose 网络通信。

## 服务器目录

```text
/opt/easy-mes/
├── compose.prod.yml
├── deploy-api.sh
├── deploy-web.sh
├── apply-control.sh              # 由 CD 校验并原子更新服务端控制文件
└── release.env                 # 当前 API/Web 镜像 digest，由发布脚本维护

/etc/easy-mes/
├── deploy.env                  # 固定镜像仓库、基础镜像和端口
├── api.env
├── mysql.env
├── minio.env
└── minio.license

/srv/easy-mes/
├── mysql/
├── minio/
├── backups/
│   ├── mysql/
│   └── minio/
├── nginx-logs/
└── acme-challenge/              # Certbot HTTP-01 验证文件
```

`backups` 是备份落点，Compose 不自动执行或轮换备份。

Compose 不单独声明名为 `nginx` 的服务。`web` 镜像的运行阶段基于 Nginx，
构建时保存 `infra/nginx/default.conf.template`。容器启动时由官方入口替换允许的端口、
服务器名称变量，生成 `/etc/nginx/conf.d/default.conf`。Web 固定提供 HTTPS，启动前必须准备有效证书。
`$uri`、`$host` 等 Nginx 请求变量保持原样。模板随镜像发布，服务器无需挂载完整 Nginx 配置。

证书由宿主机 Certbot 管理，存放在 `/etc/letsencrypt`，与 MinIO license 分开；该目录整体
只读挂载到 Web，以保留 `live/` 指向 `archive/` 的软链接和续期结果。证书、私钥和 ACME
账号不进入 Git 或镜像。公网 IP 证书获取、HTTPS 切换和续期见[HTTPS 接入](#公网-ip-的-https-接入)。

## 安装文件与入口（首次初始化部署）

服务器运行 CI 已构建的镜像，不需要安装 Node.js、pnpm 或构建源码。安装前须有
Docker Engine、Compose 插件及管理员权限；可检出仓库，也可仅上传同一代码版本的部署文件包。

安装脚本按自身位置向上两级定位文件包根目录。最小文件布局如下，`temp_deploy` 可换成其他目录名：

```text
temp_deploy/
├── infra/
│   └── compose/
│       └── compose.prod.yml
└── ops/
    ├── scripts/
    │   ├── install-easy-mes-compose
    │   ├── deploy-api.sh
    │   ├── deploy-web.sh
    │   ├── apply-control.sh
    │   └── reload-web-tls.sh
    └── config/
        └── etc/
            └── easy_mes/
                ├── deploy.env.example
                ├── api.env.example
                ├── mysql.env.example
                └── minio.env.example
```

`ops/README.md` 和 `ops/runbooks/` 可随包上传作为操作参考。服务器安装不需要
`infra/docker/` 或 `infra/nginx/`：Dockerfile 供 CI 构建使用，Nginx 模板已包含在 Web 镜像中。

可在本地仓库从确定的提交打包，`<git-sha>` 替换为与拟部署版本匹配的实际提交：

```bash
git archive --format=tar.gz --output=/tmp/easy-mes-bootstrap.tar.gz \
  '<git-sha>' ops infra/compose/compose.prod.yml
```

上传并解压后，在文件包根目录执行；例如上传到 `/root/temp_deploy` 时：

```bash
cd /root/temp_deploy
sudo bash ops/scripts/install-easy-mes-compose
```

使用 root 终端时可省略 `sudo`。`ops/` 是文件包内的运维目录，不是 Linux 系统目录。

安装脚本完成以下工作：

- 创建上方列出的 `/opt/easy-mes`、`/etc/easy-mes` 及 `/srv/easy-mes` 数据、备份、日志目录，并设置所有者与权限。
- 将 Compose 和三个运行时脚本复制到 `/opt/easy-mes`；重跑会覆盖这些控制文件。
- 安装 Certbot 的续期后重载钩子到 `/etc/letsencrypt/renewal-hooks/deploy/easy-mes-reload`；不安装 Certbot 或申请证书。
- 将四份 `.env.example` 复制为 `/etc/easy-mes/*.env`，仅补充不存在的配置文件，保留已有人工配置。Nginx 配置由容器启动入口生成，安装器不创建宿主机 Nginx 配置文件。

安装脚本不安装 Docker、不拉取镜像、不启动容器、不执行 migration 或 seed，也不创建
管理员、SSH/sudo 授权、MinIO license、HTTPS 证书或 `release.env`。`release.env` 由后续发布脚本维护。
首次安装完成后，CD 才能通过固定的 `/opt/easy-mes/*.sh` 入口更新控制文件和镜像。

## 人工配置

安装后修改服务器 `/etc/easy-mes` 中的实际配置文件，模板中的占位值必须替换。

| 文件 | 配置内容与一致性要求 |
| --- | --- |
| `deploy.env` | API/Web 镜像仓库、基础镜像、宿主机绑定地址与端口映射，以及统一提供给应用、Nginx 模板和健康检查的 Web/API 内部端口。 |
| `mysql.env` | 数据库名、应用数据库账号及密码、root 密码；首次使用空数据目录时初始化。 |
| `api.env` | 数据库连接、JWT 和 S3 配置。`DB_NAME/DB_USER/DB_PASSWORD` 分别对应 `mysql.env` 的 `MYSQL_DATABASE/MYSQL_USER/MYSQL_PASSWORD`。容器间使用 `DB_HOST=mysql`、`DB_PORT=3306`。 |
| `minio.env` | MinIO 服务凭证；按当前模板部署时，`api.env` 的 S3 账号和密码与之对应，`S3_ENDPOINT=http://minio:9000`。 |
| `minio.license` | 人工提供有效 AIStor license；镜像下载成功不代表 license 已准备好。 |

四份 env 和 license 必须归 root 所有，采用 `600` 权限。JWT 密钥等配置按模板要求填写，
不要将服务器凭证写回上传包或仓库。修改初始化变量不会重置已有数据库账号；重建测试库的
前提与步骤见[数据库初始化](database-initialization.md#可选重建开发测试库)。

`/etc/easy-mes/deploy.env` 至少配置：

```dotenv
API_IMAGE_REPOSITORY=docker.io/<docker-hub-username>/easy-mes-api
WEB_IMAGE_REPOSITORY=docker.io/<docker-hub-username>/easy-mes-web
HTTP_BIND_ADDRESS=0.0.0.0
HTTP_PORT=80
WEB_LISTEN_PORT=8091
API_PORT=3000
TLS_SERVER_NAME=替换为证书对应的公网IPv4
HTTPS_BIND_ADDRESS=0.0.0.0
HTTPS_PORT=8091
MYSQL_BIND_ADDRESS=0.0.0.0
MYSQL_PORT=13306
MINIO_CONSOLE_BIND_ADDRESS=0.0.0.0
MINIO_CONSOLE_PORT=19001
```

私有 Docker Hub 仓库需要 root 使用只读 token 登录。不要把 token 写进仓库或命令参数。

这些变量是保存在服务器 `deploy.env` 中的持久配置。发布脚本通过
`docker compose --env-file /etc/easy-mes/deploy.env` 加载，Compose 将其替换到
`${变量名:-默认值}` 中；不需要每次在命令行临时设置变量。仓库中的 `.env.example`
只用于首次安装生成配置，不是服务器运行时读取的文件。

### Nginx 配置生成与端口来源

公网 8091 → 容器 443
            └─ HTTPS：提供前端页面，反向代理 API 请求

公网 80   → 容器 8091
            ├─ /.well-known/acme-challenge/ → 返回证书验证文件
            └─ 普通页面请求 → 跳转到 https://公网IP:8091

端口统一在宿主机 `/etc/easy-mes/deploy.env` 中维护。默认 Web 内部端口为 `8091`，API 内部端口为
`3000`；业务入口使用容器固定端口 `443`。外部 HTTPS 端口由 `HTTPS_PORT` 控制，
HTTP-01 验证入口必须通过公网 `80` 到达 HTTP 监听端口。

| 变量（位于 `deploy.env`） | 使用位置 |
| --- | --- |
| `HTTP_BIND_ADDRESS`、`HTTP_PORT` | HTTP 验证与跳转入口，HTTP-01 续期要求公网 80 可达。 |
| `WEB_LISTEN_PORT` | 传入 Web，生成 Nginx 的监听端口；同时用于 Compose 映射右侧端口和 Web 健康检查。 |
| `TLS_SERVER_NAME` | 证书对应的公网 IPv4 或域名；用于 HTTPS server_name 和固定跳转目标。 |
| `HTTPS_BIND_ADDRESS`、`HTTPS_PORT` | HTTPS 宿主机绑定地址与端口，映射到容器固定的 `443`。 |
| `API_PORT` | 作为 `APP_PORT` 传入 API，并作为 `API_PORT` 传入 Web，用于 API 监听与 Nginx 代理目标。 |

Web 仅接收生成模板需要的端口和 TLS 配置，不读取 `api.env` 中的凭证。生产 `api.env` 不重复维护
`APP_PORT`，已有该项时 Compose 的 `environment` 会覆盖它；本地开发根 `.env` 仍使用 `APP_PORT`。生产 `REFRESH_TOKEN_COOKIE_SECURE` 由 Compose
固定注入 `true`；API 必须重新创建才能采用新的容器环境。

配置在不同阶段的行为如下：

- 构建镜像：保存模板及默认值，不使用部署服务器的端口生成最终配置。
- 创建容器：Compose 读取服务器配置，确定容器环境、端口映射和健康检查。
- 启动或重启容器：官方入口根据该容器已有环境变量重新生成配置，再启动 Nginx。
- 修改 `deploy.env`：必须重新创建受影响容器才会载入新值，普通 `restart` 不重新读取宿主机 env 文件。
- 修改代理规则等模板结构：重新构建并发布 Web 镜像；不要直接编辑容器内的生成结果，因为下次启动会覆盖。

安装器保留已有 env，新增必填项须在服务器人工配置。Compose 和 Web 镜像须来自同一发布版本，
证书必须在 Web 启动前准备好；CD 不申请证书，也不修改人工配置。Web 缺少证书时直接启动失败。

使用模板化镜像后，仅修改端口无需重新构建镜像。在服务器修改 `deploy.env` 后，可执行：

```bash
compose=(
  sudo docker compose
  --project-name easy-mes
  --env-file /etc/easy-mes/deploy.env
  --env-file /opt/easy-mes/release.env
  --file /opt/easy-mes/compose.prod.yml
)

"${compose[@]}" run --rm --no-deps web nginx -t
"${compose[@]}" up -d --force-recreate --wait api web
```

第一条命令在临时容器内通过官方入口生成配置，再交给 Nginx 校验；不要覆盖入口为 `nginx`，
否则会跳过模板生成。校验要求 API 服务已运行以便解析服务名，但不要求新端口已经响应。
第二条命令重新创建 API/Web，确保 API 监听、Nginx 代理、Web 映射与健康检查同步采用新值；
两者切换期间可能短暂不可用，应在维护窗口操作。仅修改 Web 端口时可限定只重新创建 Web。

Web 镜像发布也会先生成并校验候选配置，成功后才更新正式镜像记录及 Web 容器。
配置校验不等于后端连接验证，发布后的健康检查仍通过 Nginx 请求 API 存活接口。
镜像恢复不会撤销 `deploy.env` 的人工修改；环境配置错误须先修正，再重新创建相关容器。
Dockerfile 的 `EXPOSE` 只描述默认端口，不决定运行时实际监听值。

### 公网 IP 的 HTTPS 接入

本入口适用于固定公网 IPv4、公网 TCP 80/8091 可达且允许首次部署停机的服务器。固定采用 HTTPS，
不提供无证书的 HTTP 业务模式。HTTP 只处理 ACME 验证、仅容器回环可访问的 API 健康检查及
HTTPS 跳转。这里的 TLS 不覆盖 MySQL 和 MinIO 控制台维护连接。

**一、安装 Certbot 并首次获取证书。** 以下命令在服务器 root 终端执行。先检查
`command -v snap`、`command -v certbot`；没有 snap 时执行 `apt update`、`apt install -y snapd`。
没有 Certbot 时执行：

```bash
snap install --classic certbot
/snap/bin/certbot --version
```

Certbot 至少需要 5.4，以支持 IP 证书后续的 webroot 续期。已有其他来源的 Certbot 时，先核对
版本和任务，避免重复安装。首次签发使用 standalone：Certbot 临时启动验证服务占用 80，
不依赖应用或 Nginx。安全组和防火墙需允许公网 TCP 80，不能仅允许维护 IP。

```bash
ss -ltnp '( sport = :80 )'
read -rp '服务器公网 IPv4: ' MES_PUBLIC_IP
read -rp 'ACME 联系邮箱: ' MES_ACME_EMAIL
/snap/bin/certbot certonly --dry-run --standalone --no-directory-hooks \
  --preferred-profile shortlived --cert-name easy-mes \
  --ip-address "$MES_PUBLIC_IP" --email "$MES_ACME_EMAIL" --agree-tos
```

若 80 已占用，先确认占用服务，在维护窗口停止对应服务后执行，勿停止未知进程。
`--dry-run` 只做测试验证，不保存证书。成功后正式申请：

```bash
/snap/bin/certbot certonly --standalone --no-directory-hooks \
  --preferred-profile shortlived --cert-name easy-mes \
  --ip-address "$MES_PUBLIC_IP" --email "$MES_ACME_EMAIL" --agree-tos
/snap/bin/certbot certificates
```

首次申请使用 `--no-directory-hooks`，因为此时 Web 可能尚未安装，不能执行续期后的重载动作。
正式证书路径固定为 `/etc/letsencrypt/live/easy-mes/fullchain.pem`、`privkey.pem`。
保留 Certbot 管理的私钥权限和 `live/` 到 `archive/` 的软链接，不复制证书到 Git 或镜像。

**二、准备配置并部署。** 创建验证目录，在 `/etc/easy-mes/deploy.env` 填入：

```dotenv
HTTP_BIND_ADDRESS=0.0.0.0
HTTP_PORT=80
TLS_SERVER_NAME=替换为证书对应的公网IPv4
HTTPS_BIND_ADDRESS=0.0.0.0
HTTPS_PORT=8091
```

```bash
install -d -o root -g root -m 755 /srv/easy-mes/acme-challenge
```

放行 TCP 8091，然后发布对应版本的 Compose 和 Web 镜像。已有服务器可以通过下一次 main 推送
执行 CD；首次安装按本手册的安装及 API/Web 发布顺序执行。不要在证书准备好之前推送本次部署变更。
Compose 更新会将 API 的 Secure Cookie 固定设为 true，业务必须使用 HTTPS 入口。

定义后续验证共用的 Compose 参数并检查：

```bash
compose=(docker compose --project-name easy-mes
  --env-file /etc/easy-mes/deploy.env
  --env-file /opt/easy-mes/release.env
  --file /opt/easy-mes/compose.prod.yml)
"${compose[@]}" exec -T web nginx -t
curl --fail "https://${MES_PUBLIC_IP}:8091/api/health/live"
curl -I "http://${MES_PUBLIC_IP}/"
install -d -m 755 /srv/easy-mes/acme-challenge/.well-known/acme-challenge
printf 'easy-mes-acme-check\n' > /srv/easy-mes/acme-challenge/.well-known/acme-challenge/check
chmod 644 /srv/easy-mes/acme-challenge/.well-known/acme-challenge/check
```

HTTPS 验证不加 `-k`，HTTP 首页应跳转 HTTPS。从自己的电脑访问
`http://服务器公网IP/.well-known/acme-challenge/check`，应返回 `easy-mes-acme-check`，
不能是前端 HTML 或 404。浏览器访问 `https://服务器公网IP:8091`，验收登录、刷新会话和上传。
公网 8091 被复用为 HTTPS，保留其 TCP 安全组规则；无需额外放行公网 443。

**三、配置持续续期。** Web 启动后，将 Certbot 的续期验证方式切换为 webroot，使后续续期
不占用端口、不停止 Nginx。`reconfigure` 会先在测试环境验证，成功才保存续期设置：

```bash
/snap/bin/certbot reconfigure --cert-name easy-mes \
  --webroot --webroot-path /srv/easy-mes/acme-challenge
```

此步骤必须完成，否则 Certbot 会继续使用 standalone，在 Nginx 已占用 80 时续期失败。
然后安装本版本的重载脚本（从上传包根目录执行；首次安装器也会安装此钩子）：

```bash
install -d -o root -g root -m 755 /etc/letsencrypt/renewal-hooks/deploy
install -o root -g root -m 750 ops/scripts/reload-web-tls.sh \
  /etc/letsencrypt/renewal-hooks/deploy/easy-mes-reload
snap services certbot
systemctl list-timers --all snap.certbot.renew.timer
/snap/bin/certbot renew --cert-name easy-mes --dry-run --run-deploy-hooks
```

snap 的定时任务负责检查续期。钩子只处理 `easy-mes` 证书，取得与发布共用的锁后，执行
`nginx -t` 和 `nginx -s reload`。保留的证书名判断用于避免其他证书续期触发本项目，不是兼容分支。
失败会报告非零状态；证书文件更新不等同于 Nginx 已加载，可修复原因后单独重试：

```bash
RENEWED_LINEAGE=/etc/letsencrypt/live/easy-mes \
  /etc/letsencrypt/renewal-hooks/deploy/easy-mes-reload
```

IP 证书有效期约 6 天，必须确认续期任务和演练成功。钩子由安装器或人工安装，现有 CD 四文件同步
不更新它；修改钩子后需重新安装。续期无需构建镜像，保留公网 80 验证路径，定期检查续期日志和
证书有效期。`/etc/letsencrypt` 的完整备份包含私钥与 ACME 账号，按凭证保护。

参考：[IP 证书申请](https://letsencrypt.org/2026/03/11/shorter-certs-certbot)、
[续期配置修改](https://eff-certbot.readthedocs.io/en/stable/using.html#modifying-the-renewal-configuration-of-existing-certificates)。

### MySQL 客户端维护入口

Compose 将 `MYSQL_BIND_ADDRESS:MYSQL_PORT` 映射到 MySQL 容器的 `3306`，默认使用
`0.0.0.0:13306`。启动前，在安全组中仅允许维护电脑公网 IP/32 访问 TCP `13306`，
并检查没有其他规则向所有来源放行该端口。数据库客户端使用服务器公网 IP、端口 `13306`
及具备所需权限的数据库账号连接；映射端口不会创建账号或授予远程登录权限。
应用容器仍使用 `DB_HOST=mysql`、`DB_PORT=3306`。

已有安装须将 `MYSQL_BIND_ADDRESS`、`MYSQL_PORT` 补入 `/etc/easy-mes/deploy.env`，
更新 `/opt/easy-mes/compose.prod.yml` 后由 Compose 重新创建 MySQL 容器以应用映射；
数据仍保存在 `/srv/easy-mes/mysql`，无需重建数据库。

### MinIO 控制台维护入口

Compose 将 `MINIO_CONSOLE_BIND_ADDRESS:MINIO_CONSOLE_PORT` 映射到 MinIO 容器的
`9001`，默认使用 `0.0.0.0:19001`。启动服务前，在阿里云安全组中仅允许维护电脑当前
公网 IP（单个 IPv4 地址使用 `/32`）访问 TCP `19001`，并检查没有其他规则向所有来源放行
该端口。非默认端口不能替代来源 IP 限制。

服务启动后，通过 `http://服务器公网IP:19001` 访问控制台，使用服务器 `minio.env`
中配置的账号登录。当前映射提供 HTTP，不提供传输加密；需要 HTTPS 时须另行配置 TLS
或 HTTPS 反向代理。控制台端口与 S3 API 分开，应用配置仍使用
`S3_ENDPOINT=http://minio:9000`，本模板不开放公网 S3 API。

已有安装需要手动将上述两个 `MINIO_CONSOLE_*` 变量补入 `/etc/easy-mes/deploy.env`；
安装脚本不会覆盖已有 env。Compose 文件也须同步更新到 `/opt/easy-mes/compose.prod.yml`。
首次部署按下方顺序启动即可；已有服务在配置更新后需由 Compose 重新创建 MinIO 容器才能
应用端口映射，单纯重启 Docker 或容器不会应用 Compose 文件中的新映射。

## 首次部署顺序

1. 完成安装和人工配置，准备镜像访问权限、MinIO license，并按[HTTPS 接入](#公网-ip-的-https-接入)先获取正式证书。
2. 从 CI 发布摘要取得已有 API/Web 镜像各自的不可变 digest，核对镜像与控制文件版本匹配；产物规则见[镜像发布](api-image-release.md#docker-hub-产物)。首次空服务器必须准备两个应用镜像，不能依赖增量 CD 自动识别服务器缺少哪个应用。
3. 按下方入口发布 API。脚本主动拉取 API 镜像，启动 MySQL/MinIO，使用候选 API 镜像执行 migration 和 Bucket 初始化，再启动 API；基础镜像本地缺失时由 Compose 获取。
4. 按[数据库首次初始化](database-initialization.md#system-seed)执行 system seed 和管理员初始化。这些命令使用已发布的 API 镜像，无需上传 SQL 或运行源码；演示数据仅按该手册显式启用。
5. 按下方入口发布 Web，检查页面、登录、接口及文件上传。
6. 按[受限部署用户](#受限部署用户)准备 SSH/sudo 权限，并按[镜像发布](api-image-release.md)配置 Actions Secrets，接入后续 CD；若首次部署也由 CD 执行，须提前完成这些配置，seed 和管理员初始化仍单独执行。

首次手工发布是手动调用发布脚本，不要求手工执行 `docker pull` 或 `docker run` 启动应用。
API/Web 两个发布脚本每次都按传入 digest 执行拉取，提前下载镜像不等于可跳过仓库访问验证。
安装包不包含应用镜像，也不负责构建或推送镜像。

## 独立发布

API 镜像通过 workspace 依赖顺序预构建 `@company/database`，部署产物须携带其 `dist`、`migrations` 和 `seed`，生产不安装或运行 `tsx`。迁移使用本次候选的不可变 API 镜像执行一次性 `node node_modules/@company/database/dist/migrate.js`，成功后才切换 API。构建入口见 [API Dockerfile](../../infra/docker/api.Dockerfile)。

API 发布：

```bash
sudo /opt/easy-mes/deploy-api.sh 'sha256:<api-digest>'
```

它只拉取 API 镜像，确保 MySQL/MinIO 正在运行，执行数据库迁移和 Bucket 初始化，然后更新并检查 API；不拉取或重启 Web。

当前脚本在迁移前不自动停止旧 API，而部分迁移明确要求暂停业务写入。该执行前置缺口记录为[冲突 CO-04](../../docs/documentation-conflicts.md#co-04)；不能把迁移建议锁当作业务停写。发布前须核对[迁移安全](../../packages/database/docs/migration-safety.md)中本次经过的迁移边界，维护窗口及脚本责任待统一处理。

Web 发布：

```bash
sudo /opt/easy-mes/deploy-web.sh 'sha256:<web-digest>'
```

它先拉取 Web 镜像，通过官方入口生成并校验候选 Nginx 配置，再更新并检查 Web/Nginx；不执行数据库迁移，不重启 API、MySQL 或 MinIO。Web 健康检查会通过 Nginx 请求 `/api/health/live`，因此首次部署应先发布 API，再发布 Web。

两个脚本原子维护同一个 `/opt/easy-mes/release.env`：

```dotenv
API_IMAGE=docker.io/<user>/easy-mes-api@sha256:<api-digest>
WEB_IMAGE=docker.io/<user>/easy-mes-web@sha256:<web-digest>
```

API 或 Web 更新失败时只恢复对应发布前的 `release.env` 和应用容器。数据库 migration 不执行 down，失败后采用 forward-fix。

## 受限部署用户

需要自动 SSH 部署时，可分别授权两个固定入口：

```sudoers
mes-deploy ALL=(root) NOPASSWD: /opt/easy-mes/deploy-api.sh sha256\:*
mes-deploy ALL=(root) NOPASSWD: /opt/easy-mes/deploy-web.sh sha256\:*
mes-deploy ALL=(root) NOPASSWD: /opt/easy-mes/apply-control.sh *
```

三个脚本会再次严格校验 digest 或 Git SHA 参数。部署用户不需要加入 `docker` 组，
也不需要读取 `/etc/easy-mes`。`apply-control.sh` 只接受由 CD 上传到固定临时目录的
四个控制文件，并在替换前执行 Bash 与 Compose 校验；它不会修改人工配置。
