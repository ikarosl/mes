# Monorepo 应用镜像发布

`main` 分支的 CI 全部通过后，CI 调用 `.github/workflows/cd-images.yml`。该工作流不会固定重建前后端，而是先执行：

```bash
node scripts/detect-release-changes.mjs <push-before-sha> <verified-head-sha>
```

脚本通过 `turbo ls --affected --output=json` 读取 Turborepo 包依赖图。共享 workspace package 发生变化时，Turbo 会把依赖它的 API 或 Web 应用标记为受影响。脚本还单独处理不属于 workspace package 的镜像输入，例如 Dockerfile、Nginx 配置、lockfile 和根构建配置。

发布规则：

| 影响结果       | API 镜像   | Web 镜像   |
| -------------- | ---------- | ---------- |
| 仅 API         | 构建并推送 | 跳过       |
| 仅 Web         | 跳过       | 构建并推送 |
| 两者           | 构建并推送 | 构建并推送 |
| 两者都未受影响 | 跳过       | 跳过       |

首次运行或 GitHub 无法提供有效的基线 SHA 时，脚本采用保守策略，同时发布两个镜像。

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
- `SSH_DEPLOY_USER_NAME`（优先使用）
- `SSH_DEPOLY_USER_NAME`（兼容现有的误拼名称，可迁移后删除）
- `SSH_DEPLOY_SECRET`（对应部署用户的 OpenSSH 私钥）
- `SSH_KNOWN_HOSTS`（已经核对指纹的服务器主机公钥记录）

`SSH_KNOWN_HOSTS` 不属于登录私钥，但当前工作流按 Secret 读取。可在可信网络中执行
`ssh-keyscan -p <port> <host>` 获取，并与服务器控制台显示的主机指纹核对后保存。

工作流在镜像推送成功后通过 SSH 部署测试服务器。API 与 Web 分别消费各自构建输出的
digest；某个应用未受影响时，不调用对应的部署脚本。Compose 或部署脚本变化时，工作流
先同步并应用控制文件，但绝不上传或覆盖 `/etc/easy-mes` 下的人工配置。

如果 `SSH_DEPLOY_HOST` 是 `192.168.x.x` 等内网地址，`ubuntu-latest` 无法直接访问，
必须使用同一网络内的 self-hosted runner，或者建立受控的 VPN/公网 SSH 入口。

## 本地验证影响分析

```bash
pnpm release:changes:test
pnpm release:changes <base-sha> <head-sha>
```

输出中的 `apiChanged` 与 `webChanged` 决定对应镜像 Job 是否运行。不要使用 commit SHA 或新旧镜像 digest 代替包依赖影响分析；镜像标签、revision label 和 provenance 都可能让未改变业务代码的重建产生不同 digest。
