1 对象存储更改为仅S3标准适配器后再审查一遍代码，docker compose 配置项检查 正在做 （完成）

2 审查上传文件代码 完成测试 （完成）

3 审查前后端接口分页问题和现存的架构问题进行分文件和模块。并提取出项目架构 代码质量规范 完善eslint （正在）

4 统一项目环境变量 （已完成？）

5 docker 服务开发环境快速启动脚本 跨环境 平台 兼容 （待）

6 ci cd 完整模拟 保证运维部署环境

对，现在的 `pnpm infra:up` 本质上是开发环境快速启动脚本。但它当前同时启动：

```text
mysql + AIStor/MinIO + 自动建桶
```

这与你的实际环境不匹配：Windows 已经运行 MySQL，再启动 Compose MySQL 很可能争用 `3306` 端口。

更合理的设计是“默认只启动项目缺少的基础设施”，而不是强制所有开发者把 MySQL 迁入 Docker。

建议调整成：

```text
pnpm infra:up
└─ 只启动 AIStor/MinIO
   └─ 自动检查并创建 Bucket

pnpm infra:up:full
└─ 启动 MySQL + AIStor/MinIO
   └─ 自动检查并创建 Bucket
```

MySQL Compose 服务继续保留，供以下场景选择使用：

- 同事本机没有 MySQL。
- 需要隔离的开发数据库。
- CI 启动一次性测试数据库。
- 快速搭建全新开发环境。

你的环境则继续使用：

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=mes
DB_NAME=company_mes_next
```

数据库迁移始终针对 `.env` 指向的数据库：

```bash
pnpm db:migrate
```

它不关心 MySQL 来自 Windows 服务、WSL、Linux 还是 Docker。

跨平台也不需要维护三份 Compose 文件。可以统一使用一个 Compose，再通过启动器选择 Docker Engine：

```text
Windows
├─ Windows Docker 可用 → docker compose
└─ 仅 WSL Docker 可用 → wsl docker compose

Linux
└─ docker compose
```

最终建议命令结构：

```text
pnpm infra:up              # 自动选择 Docker，只启动对象存储
pnpm infra:up:full         # 自动选择 Docker，启动 MySQL + 对象存储

pnpm infra:up:wsl          # 显式使用 WSL，仅作为备用
pnpm infra:up:desktop      # 显式使用 Docker Desktop
pnpm infra:down
pnpm infra:logs

pnpm db:migrate            # 操作 .env 指向的任意 MySQL
pnpm storage:check         # 检查 S3/Bucket
pnpm storage:ensure-bucket # 初始化环境时创建缺失 Bucket
```

这样能同时满足：

- 你的 Windows MySQL 环境不会发生端口冲突。
- 同事可以选择 Compose MySQL。
- Windows、WSL、Linux 共用相同 Compose 配置。
- Bucket 初始化仍通过标准 S3 API完成，与操作系统无关。
- CI 可以单独启动完整的临时基础设施。
