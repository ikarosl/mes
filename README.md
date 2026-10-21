# Easy MES Next

轻量 MES，采用 pnpm monorepo 和模块化单体。API 为 NestJS，管理端为 Vue；业务范围与排除项见[产品范围](docs/product-scope.md)，开发规则见 [AGENTS.md](AGENTS.md)，未完成工作见[路线图](docs/roadmap.md)。

从[文档索引](docs/README.md)查找对应模块的当前规则；业务事实、审批和库存分别由各模块所有，根入口不重复维护它们的状态与数量公式。

## 快速开始（测试环境）

1. 复制 `.env.example` 为 `.env`，设置数据库、S3 对象存储、长度不少于 32 位的 JWT 密钥，以及管理员账号（`ADMIN_PASSWORD` 不少于 6 位）。
2. 安装依赖：`pnpm install --frozen-lockfile`。
3. 按环境选择初始化方式：
   - **已有 MySQL／S3 服务**：在 `.env` 填写实际连接配置，确保 S3 Bucket 已准备好，运行 `pnpm db:init` 初始化数据库。
   - **使用容器基础设施**：运行 `pnpm infra:init`，启动 MySQL（容器名 `dev_test_sql`，宿主 `3307` 映射容器 `3306`）与 MinIO（容器名 `dev_test_minio`），确保 Bucket 存在，再执行数据库初始化。只启动容器可运行 `pnpm infra:up`。
4. 启动 API：`pnpm dev:api`。
5. 启动管理端：`pnpm dev:admin`。

开发测试数据库允许重置，重置后通过 migration／seed 恢复，不依赖原有业务数据。数据库集成测试使用专用测试库，配置与门禁见[测试策略](docs/testing-strategy.md)。

## 数据库命令

- `pnpm db:init`：从数据库创建到 migration、system seed、管理员初始化；重跑会按当前 `ADMIN_PASSWORD` 更新管理员密码。
- `pnpm db:migrate`：已有环境只升级 schema 与随版本发布的权限目录，不创建角色或账号。
- `pnpm db:migrate:status`：查询当前环境的迁移状态。
- `pnpm db:seed:demo`：显式加载演示数据，要求 `ALLOW_DEMO_SEED=1` 和独立 `DEMO_USER_PASSWORD`；不自动进入初始化、生产部署或 CI。

各运行器及源码／构建产物入口见[数据库包](packages/database/README.md)，服务器初始化见[运维手册](ops/runbooks/database-initialization.md)，演示账号和重复加载边界见[演示数据](packages/database/demo/README.md)。真实 MySQL 集成测试的专用库、环境变量及命令见[测试策略](docs/testing-strategy.md#业务-mysql-integration)。

## 验证

```text
pnpm verify
```

项目使用 pnpm workspace 管理依赖，并由 Turborepo 编排 `dev`、`build`、`typecheck` 和 `test`。根入口与包级公开脚本都会进入同一条依赖拓扑；`dev` 使用 Turbo watch，在共享包源码变化后先重建受影响依赖，再重启应用。带 `:run` 或 `:serve` 后缀的脚本是供 Turbo 调度的内部任务，不作为手工入口。构建与测试任务可缓存；数据库迁移、迁移状态检查和管理员初始化明确禁止缓存。

## 项目规范

- 执行规则：[AGENTS.md](AGENTS.md)
- 全局文档索引：[docs/README.md](docs/README.md)
- 代码架构：[docs/architecture.md](docs/architecture.md)
- 管理端文档：[apps/admin-web/README.md](apps/admin-web/README.md)
- API 文档：[apps/api/README.md](apps/api/README.md)
- HTTP 接口：[docs/api-conventions.md](docs/api-conventions.md)
- 并发与幂等规则：[apps/api/docs/idempotency.md](apps/api/docs/idempotency.md)
- 编码规范：[docs/coding-standards.md](docs/coding-standards.md)
- 数据库公共约定：[docs/database-conventions.md](docs/database-conventions.md)
- 数据库运行与迁移：[packages/database/README.md](packages/database/README.md)
- 技术文件存储：[apps/api/src/modules/product/docs/technical-files.md](apps/api/src/modules/product/docs/technical-files.md)
- 测试策略：[docs/testing-strategy.md](docs/testing-strategy.md)
- 产品范围：[docs/product-scope.md](docs/product-scope.md)
- 路线图：[docs/roadmap.md](docs/roadmap.md)
- 运维入口：[ops/README.md](ops/README.md)
