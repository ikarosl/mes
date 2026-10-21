# 运维入口

`ops/` 拥有单机 Compose 测试服务器的安装、发布和运行手册。基础设施拓扑与镜像配置位于 `infra/`，业务应用和数据库设计不在这里重复维护。

## Runbooks

- [Compose 测试服务器部署](runbooks/compose-server-deployment.md)
- [API/Web 镜像发布](runbooks/api-image-release.md)
- [数据库首次初始化与演示数据](runbooks/database-initialization.md)

## 脚本

| 脚本 | 使用时机与职责 |
| --- | --- |
| `scripts/install-easy-mes-compose` | 首次安装：建立运行、配置及数据目录，安装 Compose 配置、发布脚本和缺失的配置模板。 |
| `scripts/deploy-api.sh` | API 发布：拉取指定 digest 的 API 镜像，启动基础服务，执行 migration、Bucket 初始化并启动检查 API。 |
| `scripts/deploy-web.sh` | Web 发布：拉取指定 digest 的 Web 镜像，启动并检查 Web/Nginx。 |
| `scripts/apply-control.sh` | 后续 CD：校验并更新控制文件；已有发布记录时按新 Compose 配置协调运行中的服务。 |

首次安装使用已有应用镜像，无需在服务器构建源码。上传文件必须保留 `ops/` 与
`infra/compose/compose.prod.yml` 的相对位置；仅上传 `ops/` 不完整。
安装包目录、脚本执行边界、人工配置和首装顺序统一见
[服务器部署手册](runbooks/compose-server-deployment.md#安装文件与入口)。

脚本必须从对应 runbook 的入口调用。不得把 `/etc/easy-mes` 中的人工配置、凭证或生产数据复制回仓库。
