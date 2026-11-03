# 运维入口

`ops/` 拥有单机 Compose 测试服务器的安装、发布和运行手册。基础设施拓扑与镜像配置位于 `infra/`，业务应用和数据库设计不在这里重复维护。
TLS 续期钩子由首次安装器安装；后续更新须按[部署手册](runbooks/compose-server-deployment.md#公网-ip-的-https-接入)手工上传和安装，常规 CD 不同步该文件。

## Runbooks

- [Compose 测试服务器部署](runbooks/compose-server-deployment.md)
- [API/Web 镜像发布](runbooks/api-image-release.md)
- [数据库首次初始化与演示数据](runbooks/database-initialization.md)
- [MySQL／MinIO 备份、恢复与维护失败处理](runbooks/mysql-backup-restore.md)

## 脚本

| 脚本 | 使用时机与职责 |
| --- | --- |
| `scripts/install-easy-mes-compose` | 首次安装：建立运行、配置及数据目录，安装 Compose 配置、发布脚本和缺失的环境配置。 |
| `scripts/deploy-api.sh` | API 发布：拉取固定 digest，停止 Web/API，完整备份后执行 migration、Bucket 初始化，API readiness 成功后恢复原 Web 入口。 |
| `scripts/deploy-web.sh` | Web 发布：拉取指定 digest 的 Web 镜像，生成并校验候选 Nginx 配置，启动并检查 Web/Nginx。 |
| `scripts/reload-web-tls.sh` | Certbot 续期钩子：取得部署锁、校验并重载 Web/Nginx，加载更新后的证书。 |
| `scripts/apply-control.sh` | 后续 CD：校验并更新控制文件；已有发布记录时按新 Compose 配置协调运行中的服务。 |
| `scripts/backup-mysql.sh` | 人工／半月／发布的 MySQL＋业务附件配套备份；与发布共用锁，失败保留维护状态。 |
| `scripts/minio-backup.mjs` | 在 API 镜像中导出／恢复当前业务 Bucket 的对象，由维护入口调用。 |
| `scripts/restore-minio.sh` | 将配套附件备份恢复到隔离实例的同名新 Bucket。 |
| `scripts/notify-backup-failure.sh` | 使用服务器配置的 SMTP 发送失败提醒。 |
| `scripts/restore-mysql.sh` | 校验备份并恢复到显式的新数据库，不覆盖已有库。 |
| `scripts/resume-api.sh` | 人工审查数据库及镜像后，以 migration status 和 readiness 门禁恢复维护前的入口。 |

首次安装使用已有应用镜像，无需在服务器构建源码。上传文件必须保留 `ops/` 与
`infra/compose/compose.prod.yml` 的相对位置；仅上传 `ops/` 不完整。
安装包目录、脚本执行边界、人工配置和首装顺序统一见
[服务器部署手册](runbooks/compose-server-deployment.md#安装文件与入口)。

脚本必须从对应 runbook 的入口调用。不得把 `/etc/easy-mes` 中的人工配置、凭证或生产数据复制回仓库。
