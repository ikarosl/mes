# Company MES Next

当前已落地范围：RBAC、认证、操作日志、管理端权限控制、多标签页路由缓存、产品主数据、技术文件、工序和工艺路线。Production 正在分阶段迁移：生产工单、生产批次、工序报工追溯，以及其依赖的生产物料需求、分配和领料出库链路。通用库存、入库、退料、报废、盘点、质量和全链路追溯后端尚未迁移。

## 快速开始

1. 复制 `.env.example` 为 `.env`，设置数据库、长度不少于 32 位的 JWT 密钥，以及管理员账号（`ADMIN_PASSWORD` 不少于 6 位）。
2. 启动基础设施：`pnpm infra:up`。该命令显式读取仓库根目录唯一的 `.env`。
3. 安装依赖：`pnpm install --frozen-lockfile`。
4. 初始化空库：`pnpm db:init`。该命令依次执行 migration、系统 seed 和管理员账号初始化。
5. 启动 API：`pnpm dev:api`。
6. 启动管理端：`pnpm dev:admin`。

## 数据库命令

- `pnpm db:migrate`：只应用 schema 与随代码发布的权限目录，不创建角色或账号；用于生产 schema upgrade。
- `pnpm db:seed`：幂等写入不含凭证的系统基础数据，包括内置管理员角色、通配权限及其关联。
- `pnpm db:bootstrap-admin`：使用 `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`ADMIN_DISPLAY_NAME` 创建或更新管理员账号；要求先执行 seed。
- `pnpm db:init`：依次执行上述三步，用于从空库初始化到可登录状态。对已有库重跑会按当前 `ADMIN_PASSWORD` 更新管理员密码，生产环境仅升级 schema 时应使用 `db:migrate`。
- `pnpm test:production:mysql`：真实 MySQL 集成测试，仅针对专用测试库（`TEST_DB_NAME` 必填，`DB_NAME` 必须与 `TEST_DB_NAME` 完全相等且库名以 `_test` 结尾，如本地 `easy_mes_test`；CI 使用 `company_mes_next_test`）；执行统一初始化链路、复验 seed 幂等性并运行真实 MySQL integration tests。环境变量设置方式任选其一：
  - PowerShell：`$env:RUN_MYSQL_INTEGRATION='1'; $env:TEST_DB_NAME='easy_mes_test'; $env:DB_NAME='easy_mes_test'`，再执行 `pnpm test:production:mysql`；
  - Bash：`RUN_MYSQL_INTEGRATION=1 TEST_DB_NAME=easy_mes_test DB_NAME=easy_mes_test pnpm test:production:mysql`；
  - 或写入仓库根 `.env`（`scripts/assert-mysql-integration-enabled.mjs` 会先加载 `.env` 再判定门禁；系统环境变量优先于 `.env`）。
- `pnpm db:seed:demo`（未来按需增加）：加载演示或联调环境的样例数据（产品、物料、工艺路线、工单等），SQL 置于独立的 `packages/database/demo` 目录（如 `001-demo-users.sql`、`002-demo-products.sql`）；仅用于演示/联调环境，`db:init`、生产部署与 CI 均不会自动加载。

## 验证

```text
pnpm verify
```

项目使用 pnpm workspace 管理依赖，并由 Turborepo 编排 `dev`、`build`、`typecheck` 和 `test`。构建与测试任务可缓存；数据库迁移、迁移状态检查和管理员初始化明确禁止缓存。

Access Token 只存在页面内存；刷新页面或打开新浏览器标签时，前端通过 HttpOnly Refresh Cookie 恢复会话。应用内部多标签页由 Pinia 维护，并使用 Vue KeepAlive 缓存页面实例。

## 项目规范

- 执行规则：[agents.md](agents.md)
- 代码架构：[docs/architecture.md](docs/architecture.md)
- 前端架构：[docs/frontend-architecture.md](docs/frontend-architecture.md)
- HTTP 接口：[docs/api-conventions.md](docs/api-conventions.md)
- 并发与幂等规则：[docs/concurrency-and-idempotency.md](docs/concurrency-and-idempotency.md)
- HTTP 幂等实施方案：[docs/http-idempotency-implementation-plan.md](docs/http-idempotency-implementation-plan.md)
- 编码规范：[docs/coding-standards.md](docs/coding-standards.md)
- 数据库设计：[docs/database/README.md](docs/database/README.md)
- 管理端设计：[design.md](design.md)
- 测试策略：[docs/testing-strategy.md](docs/testing-strategy.md)
