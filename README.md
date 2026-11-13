# Easy MES Next

轻量 MES，采用 pnpm monorepo 和模块化单体。API 为 NestJS，管理端为 Vue；业务范围与排除项见[产品范围](docs/product-scope.md)，开发规则见 [AGENTS.md](AGENTS.md)，未完成工作见[路线图](docs/roadmap.md)。

从[文档索引](docs/README.md)查找对应模块的当前规则；业务事实、审批和库存分别由各模块所有，根入口不重复维护它们的状态与数量公式。

## 仓库简化实验分支

本分支 `experiment/warehouse-simplification` 基于追踪卡实验，采用[仓库独立办理方案](docs/adr/0028-independent-warehouse-receipt-and-inspection.md)。到货登记、检查报告、仓库实际入库与补单独立办理。首次切换实验模型使用新建独立空库，不转换实验之前的旧业务模型；此后实验库已有数据通过增量迁移保留升级。原业务库不要执行破坏性的实验初始迁移，已有基线文件保持不可变。

在 PowerShell 为本次命令指定独立库，连接及凭据仍从本机 `.env` 读取：

```powershell
$env:DB_NAME='easy_mes_warehouse_simplification_20261111'
corepack pnpm db:init
$env:ALLOW_DEMO_SEED='1'
corepack pnpm db:seed:demo
$env:APP_PORT='3003'
corepack pnpm exec turbo watch dev:serve --filter=@company/api --env-mode=loose
```

管理端在另一个终端设置同一 `APP_PORT=3003`，运行 `corepack pnpm exec turbo watch dev:serve --filter=@company/admin-web --env-mode=loose`；以 Vite 输出地址访问。仓库和追踪卡场景工具见[演示入口](tools/demo/README.md)。实验范围、当前规则和验收状态分别由 ADR、模块文档和路线图维护。

## 快速开始（测试环境）

1. 复制 `.env.example` 为 `.env`，设置数据库、S3 对象存储、长度不少于 32 位的 JWT 密钥，以及管理员账号（`ADMIN_PASSWORD` 不少于 6 位）。
2. 安装依赖：`pnpm install --frozen-lockfile`。
3. 按环境选择初始化方式：
   - **已有 MySQL／S3 服务**：在 `.env` 填写实际连接配置，确保 S3 Bucket 已准备好，运行 `pnpm db:init` 初始化数据库。
   - **使用容器基础设施**：运行 `pnpm infra:init`，启动 MySQL（容器名 `dev_test_sql`，宿主 `3307` 映射容器 `3306`）与 MinIO（容器名 `dev_test_minio`），确保 Bucket 存在，再执行数据库初始化。只启动容器可运行 `pnpm infra:up`。
4. 启动 API：`pnpm dev:api`。
5. 启动管理端：`pnpm dev:admin`。

常规主线已有业务库通过增量 migration 保留数据升级；本实验最初从上方独立空库建立，此后已有实验库同样保留数据增量升级，不能再次清空或重跑 demo 替代迁移。重置授权边界见 [AGENTS.md](AGENTS.md#数据库与交付约定)。数据库集成测试使用隔离的专用测试库，配置与门禁见[测试策略](docs/testing-strategy.md)。

## 数据库命令

- `pnpm db:init`：从数据库创建到 migration、system seed、管理员初始化；重跑会按当前 `ADMIN_PASSWORD` 更新管理员密码。
- `pnpm db:migrate`：已有环境只升级 schema 与随版本发布的权限目录，不创建角色或账号。
- `pnpm db:migrate:status`：查询当前环境的迁移状态。
- `pnpm db:seed:demo`：显式加载演示数据，要求 `ALLOW_DEMO_SEED=1` 和独立 `DEMO_USER_PASSWORD`；不自动进入初始化、生产部署或 CI。

各运行器及源码／构建产物入口见[数据库包](packages/database/README.md)，服务器初始化见[运维手册](ops/runbooks/database-initialization.md)，演示账号和重复加载边界见[演示数据](packages/database/demo/README.md)。真实 MySQL 集成测试的专用库、环境变量及命令见[测试策略](docs/testing-strategy.md#业务-mysql-integration)。

基于演示数据、通过业务 API 准备采购与来料质检场景，见[场景数据工具](tools/demo/README.md)。工程脚本、场景工具与本地临时文件的职责划分见[编码规范](docs/coding-standards.md#工程脚本与临时文件)。

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
