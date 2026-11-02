# Monorepo 应用镜像发布

`main` 的 CI 全部通过后调用[镜像工作流](../../.github/workflows/cd-images.yml)，只构建、推送受影响的 API／Web 镜像；是否自动部署服务器由下方开关控制。共享包变更按依赖关系传播，镜像和根配置也计入影响；基线 SHA 无效时保守发布两者。判断实现见[发布影响分析](../../scripts/detect-release-changes.mjs)。

## 自动部署开关

在 GitHub 仓库 `Settings → Secrets and variables → Actions → Variables` 配置仓库变量 `AUTO_DEPLOY_ENABLED`，它不是 Secret。只有值为 `true` 时才允许服务器部署；未配置或设为 `false` 时，CI、镜像构建及推送照常执行，跳过 SSH、控制文件同步和 API/Web 部署，`released` 标签也不会前移。

首次安装、数据库重建或人工维护期间保持关闭，从工作流摘要取得本次镜像 digest，按[服务器部署手册](compose-server-deployment.md)和[数据库初始化](database-initialization.md)完成手动发布与验收后再开启。开启变量本身不会触发发布；后续 `main` 推送或重新运行工作流时才会重新判断，不能把重跑旧工作流当作仅重新执行测试。关闭变量不会中止已经开始的部署。

## Docker Hub 产物

工作流使用以下仓库：

- `<DOCKER_HUB_USERNAME>/easy-mes-api`
- `<DOCKER_HUB_USERNAME>/easy-mes-web`

每个实际发布的镜像都有两个标签：

- `sha-<完整 Git SHA>`：用于追踪代码来源。
- `latest`：用于发现最新版本，不作为服务器部署或回滚依据。

工作流摘要会记录镜像 digest。服务器发布必须使用 `repository@sha256:...`，并继续发布 BuildKit provenance 与 SBOM。

GitHub Actions secrets：

- `DOCKER_HUB_USERNAME`
- `DOCKER_HUB_TOKEN`
- `SSH_DEPLOY_HOST`
- `SSH_DEPLOY_PORT`
- `SSH_DEPLOY_USER_NAME`
- `SSH_DEPLOY_SECRET`（对应部署用户的 OpenSSH 私钥）
- `SSH_KNOWN_HOSTS`（已经核对指纹的服务器主机公钥记录）

SSH_KNOWN_HOSTS 有格式要求：IP地址 公钥算法 公钥内容
无自定义端口：203.0.113.10 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA……
有自定义端口：[203.0.113.10]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA……

`SSH_KNOWN_HOSTS` 不属于登录私钥，但当前工作流按 Secret 读取。可在可信网络中执行
`ssh-keyscan -p <port> <host>` 获取，并与服务器控制台显示的主机指纹核对后保存。

开启自动部署时，工作流在镜像推送成功后通过 SSH 部署测试服务器。API 与 Web 分别消费各自构建输出的
digest；某个应用未受影响时，不调用对应的部署脚本。Compose 或部署脚本变化时，工作流
先同步并应用控制文件，但绝不上传或覆盖 `/etc/easy-mes` 下的人工配置。

API 发布在停 Web/API 入口后先做完整数据库备份，再执行 migration 和候选镜像激活；失败保持维护状态，不自动恢复旧 API。备份、空库恢复、一次性控制入口升级及后续凌晨部署的未启用约束见[备份恢复手册](mysql-backup-restore.md)。控制文件协调只处理原来运行的 API/Web，不升级 MySQL/MinIO，也不自动启用备份 timer。

如果 `SSH_DEPLOY_HOST` 是 `192.168.x.x` 等内网地址，`ubuntu-latest` 无法直接访问，
必须使用同一网络内的 self-hosted runner，或者建立受控的 VPN/公网 SSH 入口。

## 本地验证影响分析

```bash
pnpm release:changes:test
pnpm release:changes '<base-sha>' '<head-sha>'
```

输出中的 `apiChanged` 与 `webChanged` 决定对应镜像 Job 是否运行。不要使用 commit SHA 或新旧镜像 digest 代替包依赖影响分析；镜像标签、revision label 和 provenance 都可能让未改变业务代码的重建产生不同 digest。
