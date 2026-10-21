# Docker Compose 测试服务器部署

`infra/compose/compose.prod.yml` 在单机测试服务器运行 MySQL、MinIO、API 和承载管理端的 Nginx。业务流量通过 Nginx 进入，当前模板端口为 `8091`。MySQL 和 MinIO 控制台分别通过宿主机 `13306`、`19001` 端口供维护人员访问；MinIO S3 API 和应用 API 不发布宿主机端口，服务之间通过 Compose 网络通信。

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
└── nginx-logs/
```

`backups` 是备份落点，Compose 不自动执行或轮换备份。

Compose 不单独声明名为 `nginx` 的服务。`web` 镜像的运行阶段基于 Nginx，
并在构建时把 `infra/nginx/default.conf` 复制到镜像中，因此 `web` 服务就是
对外入口。Compose 端口映射右侧的容器端口必须等于 Nginx 的 `listen` 端口；
左侧的 `HTTP_PORT` 是宿主机端口，两者不要求使用同一个值。

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
    │   └── apply-control.sh
    └── config/
        └── etc/
            └── easy_mes/
                ├── deploy.env.example
                ├── api.env.example
                ├── mysql.env.example
                └── minio.env.example
```

`ops/README.md` 和 `ops/runbooks/` 可随包上传作为操作参考。服务器安装不需要
`infra/docker/` 或 `infra/nginx/`：Dockerfile 供 CI 构建使用，Nginx 配置已包含在 Web 镜像中。

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
- 将四份 `.env.example` 复制为 `/etc/easy-mes/*.env`，仅补充不存在的配置文件，保留已有人工配置。

安装脚本不安装 Docker、不拉取镜像、不启动容器、不执行 migration 或 seed，也不创建
管理员、SSH/sudo 授权、MinIO license 或 `release.env`。`release.env` 由后续发布脚本维护。
首次安装完成后，CD 才能通过固定的 `/opt/easy-mes/*.sh` 入口更新控制文件和镜像。

## 人工配置

安装后修改服务器 `/etc/easy-mes` 中的实际配置文件，模板中的占位值必须替换。

| 文件 | 配置内容与一致性要求 |
| --- | --- |
| `deploy.env` | API/Web 镜像仓库、MySQL/MinIO 镜像、Web、MySQL 与 MinIO 控制台的宿主机绑定地址和端口。 |
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
HTTP_PORT=8091
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

1. 完成安装和人工配置，准备好所需镜像的访问权限及 MinIO license。
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

它只拉取、更新并检查 Web/Nginx；不执行数据库迁移，不重启 API、MySQL 或 MinIO。Web 健康检查会通过 Nginx 请求 `/api/health/live`，因此首次部署应先发布 API，再发布 Web。

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
