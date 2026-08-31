# Easy MES Next

当前已落地范围：RBAC、认证、操作日志、管理端权限控制、多标签页路由缓存、产品主数据、技术文件、工序和工艺路线，以及 Production 的生产工单、生产批次、工序报工追溯、异常返工、工序异常报废产生人工补料需求、生产物料需求、外购物料入库、库存批次查询、分配、领料出库、生产退料和库存盘点链路。通用其他入库、通用报废、质量和全链路追溯后端尚未迁移；这里的工序异常报废只属于 Production 的最小闭环，不代表通用库存报废已经迁移。

## 快速开始（测试环境）

1. 复制 `.env.example` 为 `.env`，设置数据库、长度不少于 32 位的 JWT 密钥，以及管理员账号（`ADMIN_PASSWORD` 不少于 6 位）。
2. 安装依赖：`pnpm install --frozen-lockfile`。
3. 启动基础设施并初始化数据库：`pnpm infra:init`。该命令会先启动 MySQL（容器名 `dev_test_sql`，宿主 `3307` 映射容器 `3306`）与 MinIO（容器名 `dev_test_minio`），确保对象存储 Bucket 存在，然后依次执行 `db:ensure`（按 `.env` 创建数据库）、`db:migrate`、`db:seed`、`db:bootstrap-admin`。仅想启动容器不初始化数据库时，可单独使用 `pnpm infra:up`。
4. 启动 API：`pnpm dev:api`。
5. 启动管理端：`pnpm dev:admin`。

数据库集成测试必须使用专用测试库；基础设施和初始化可通过 `pnpm infra:init` 完成。
## 数据库命令

- `pnpm db:ensure`：按 `.env` 创建数据库（若不存在）；通常由 `db:init` 自动调用。
- `pnpm db:migrate`：只应用 schema 与随代码发布的权限目录，不创建角色或账号；要求数据库已存在，用于生产 schema upgrade。
- `pnpm db:seed`：幂等写入不含凭证的系统基础数据，包括内置管理员角色、通配权限及其关联。
- `pnpm db:bootstrap-admin`：使用 `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`ADMIN_DISPLAY_NAME` 创建或更新管理员账号；要求先执行 seed。
- `pnpm db:init`：先按 `.env` 创建数据库（若不存在），再依次执行上述三步，用于从空库初始化到可登录状态。对已有库重跑会按当前 `ADMIN_PASSWORD` 更新管理员密码，生产环境仅升级 schema 时应使用 `db:migrate`。
- `pnpm test:production:mysql`：真实 MySQL 集成测试，仅针对专用测试端点与以 `_test` 结尾的专用测试库。`TEST_DB_HOST/PORT/NAME` 必填，且 `DB_HOST/PORT/NAME` 必须与之完全相等。本地 Docker 默认映射为宿主 `3307` 到容器 `3306`；CI 服务容器继续使用 `3306`。

仓库根目录的数据库命令是开发与 CI 入口，由 `tsx` 直接执行 `packages/database/src`，修改运行器后无需先手工构建。`@company/database` 同时提供成对的 `*:compiled` 脚本，用 Node 执行构建后的 `dist`，用于验证编译产物。生产镜像不安装 `tsx`，CD 应使用同一 API 镜像运行一次性迁移任务 `node node_modules/@company/database/dist/migrate.js`，迁移成功后再启动 API；不得在每个 API 副本启动时自动执行迁移。

PowerShell：

```powershell
$env:RUN_MYSQL_INTEGRATION='1'
$env:TEST_DB_HOST='127.0.0.1'
$env:TEST_DB_PORT='3307'
$env:TEST_DB_NAME='easy_mes_test'
$env:DB_HOST=$env:TEST_DB_HOST
$env:DB_PORT=$env:TEST_DB_PORT
$env:DB_NAME=$env:TEST_DB_NAME
pnpm test:production:mysql
```

Bash：

```bash
RUN_MYSQL_INTEGRATION=1 TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=3307 \
TEST_DB_NAME=easy_mes_test DB_HOST=127.0.0.1 DB_PORT=3307 \
DB_NAME=easy_mes_test pnpm test:production:mysql
```

也可在仓库根 `.env` 配置 `TEST_DB_*`，但为避免常规开发连接被改为测试库，建议只在执行命令的终端临时覆盖 `DB_*`。系统环境变量优先于 `.env`。

- `pnpm db:seed:demo`：显式加载 `packages/database/demo` 中的演示或联调数据；要求 `ALLOW_DEMO_SEED=1` 和独立的 `DEMO_USER_PASSWORD`，`db:init`、生产部署与 CI 均不会自动执行。

## 验证

```text
pnpm verify
```

项目使用 pnpm workspace 管理依赖，并由 Turborepo 编排 `dev`、`build`、`typecheck` 和 `test`。构建与测试任务可缓存；数据库迁移、迁移状态检查和管理员初始化明确禁止缓存。

Access Token 只存在页面内存；刷新页面或打开新浏览器标签时，前端通过 HttpOnly Refresh Cookie 恢复会话。应用内部多标签页由 Pinia 维护，并使用 Vue KeepAlive 缓存页面实例。

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
