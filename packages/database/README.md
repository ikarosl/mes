# packages/database

数据库基础设施包，负责 MySQL 连接池、事务上下文、migration/seed 运行器和数据库初始化命令。它集中承载 migration 文件，但不拥有 Identity、Product 或 Production 的业务表设计。

## 导出能力

- `createDatabasePool`：按统一配置创建 MySQL 连接池，并把会话时区设置为 `+08:00`。
- `withTransaction`：提供可嵌套复用的单数据库事务边界。
- `withActiveConnection`：在已有事务中复用活动连接，否则使用连接池。
- `DatabaseError`：标记数据库边界和事务内已标记连接的查询错误，保留原始 `cause` 供上层分类。

业务 Repository 位于各 API 模块的 infrastructure 层，本包不包含业务 Repository、领域模型或跨模块查询入口。

## 运行器与目录

```text
src/          # 连接、事务、迁移、seed 和初始化运行器
migrations/   # 全项目 append-only migration 注册表
seed/         # 不含凭证的系统基础数据
demo/         # 显式启用的演示数据
docs/         # 迁移运行与安全说明
```

常用命令由仓库根统一暴露：

- `pnpm db:ensure`
- `pnpm db:migrate`
- `pnpm db:migrate:status`
- `pnpm db:seed`
- `pnpm db:bootstrap-admin`
- `pnpm db:init`

数据库变更只能追加成对 migration，已经执行的文件不可修改。详细规则见[迁移顺序](docs/90-migration-order.md)、[迁移门禁](docs/migration-readiness.md)和[迁移安全](docs/migration-safety.md)。

## 业务数据库设计

migration 的物理位置不表示业务所有权。业务表设计跟随代码所有者维护：

- [Identity 数据库设计](../../apps/api/src/modules/identity/docs/database.md)
- [Product 数据库设计](../../apps/api/src/modules/product/docs/database.md)
- [Production 数据库设计](../../apps/api/src/modules/production/docs/database/README.md)
- [平台操作审计](../../apps/api/docs/audit.md)
- [平台 HTTP 幂等](../../apps/api/docs/idempotency.md)
- [跨模块数据库约定](../../docs/database-conventions.md)

## 验证

```text
corepack pnpm --filter @company/database test
corepack pnpm --filter @company/database typecheck
corepack pnpm migration:check
```
