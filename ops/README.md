# 运维入口

`ops/` 拥有单机 Compose 测试服务器的安装、发布和运行手册。基础设施拓扑与镜像配置位于 `infra/`，业务应用和数据库设计不在这里重复维护。

## Runbooks

- [Compose 测试服务器部署](runbooks/compose-server-deployment.md)
- [API/Web 镜像发布](runbooks/api-image-release.md)
- [数据库首次初始化与演示数据](runbooks/database-initialization.md)

## 脚本

- `scripts/install-easy-mes-compose`：安装服务器控制文件和首次配置模板。
- `scripts/apply-control.sh`：校验并原子更新服务端控制文件。
- `scripts/deploy-api.sh`：按不可变 digest 发布 API，执行 migration 与 Bucket 初始化。
- `scripts/deploy-web.sh`：按不可变 digest 发布管理端 Web/Nginx。

脚本必须从对应 runbook 的入口调用。不得把 `/etc/easy-mes` 中的人工配置、凭证或生产数据复制回仓库。
