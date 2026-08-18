# Docker Compose 测试服务器部署

`infra/compose/compose.prod.yml` 在单机测试服务器运行 MySQL、MinIO、API 和承载管理端的 Nginx。MySQL、MinIO、API 只加入 Compose 内部网络；外部流量通过 Nginx 进入，当前模板端口为 `8091`。

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

## 安装

在服务器上的仓库根目录执行：

```bash
sudo bash ops/scripts/install-easy-mes-compose
```

`ops/` 是仓库内自建的运维目录，不是 Linux 系统目录。上面的命令必须在已经检出
本仓库的根目录执行。首次安装完成后，CD 才能通过固定的 `/opt/easy-mes/*.sh`
入口更新控制文件和镜像。

配置模板保存在仓库的 `ops/config/etc/easy_mes/`。安装脚本只在目标文件不存在时复制模板，不覆盖已经配置好的 `/etc/easy-mes/*.env`。

`/etc/easy-mes/deploy.env` 至少配置：

```dotenv
API_IMAGE_REPOSITORY=docker.io/<docker-hub-username>/easy-mes-api
WEB_IMAGE_REPOSITORY=docker.io/<docker-hub-username>/easy-mes-web
HTTP_BIND_ADDRESS=0.0.0.0
HTTP_PORT=8091
```

私有 Docker Hub 仓库需要 root 使用只读 token 登录。不要把 token 写进仓库或命令参数。

## 独立发布

API 发布：

```bash
sudo /opt/easy-mes/deploy-api.sh 'sha256:<api-digest>'
```

它只拉取 API 镜像，确保 MySQL/MinIO 正在运行，执行数据库迁移和 Bucket 初始化，然后更新并检查 API；不拉取或重启 Web。

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
