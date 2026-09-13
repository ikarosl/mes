# packages/database

数据库基础设施包，负责 MySQL 连接池、事务上下文、migration/seed 运行器和数据库初始化命令。它集中承载 migration 文件，但不拥有 Identity、Product、Production 或 Approval 的业务表设计。

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

`db:ensure` 的直接执行判断使用本机文件路径，Windows 与 Linux 均会实际创建目标库；通过导入复用 `ensureDatabaseExists` 时不自动连接数据库。

## 迁移登记表 `_schema_migrations`

本表由本包的[迁移运行器](src/migrate.ts)在执行版本化 migration 前通过 `CREATE TABLE IF NOT EXISTS` 创建，属于数据库基础设施，不归任何业务模块所有。使用 InnoDB、`utf8mb4`；建表语句未显式指定排序规则。

| 字段 | 类型 | 允许 NULL | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `name` | `VARCHAR(255)` | 否（主键隐含） | 无 | 已执行的 `.up.sql` 文件名，包含扩展名；不自增 |
| `checksum` | `CHAR(64)` | 否 | 无 | 迁移 SQL 文件内容的 SHA-256 十六进制校验和 |
| `applied_at` | `DATETIME` | 否 | `CURRENT_TIMESTAMP` | SQL 执行成功后登记该迁移的时间 |

物理约束只有 `PRIMARY KEY (name)`；没有额外唯一键、二级索引、外键或 CHECK。`checksum` 的摘要算法及已执行文件内容不可变由运行器校验，不由数据库 CHECK 保证。本表不继承业务审计、乐观锁或软删除字段。

运行器持有迁移建议锁后读取登记记录：同名且校验和相同则跳过，不同则报错；尚未登记的迁移在 SQL 执行成功后插入记录。MySQL DDL 与登记写入不构成可整体回滚的事务；失败恢复边界见[迁移安全](docs/migration-safety.md)。

## 业务数据库设计

migration 的物理位置不表示业务所有权。业务表设计跟随代码所有者维护：

- [Identity 数据库设计](../../apps/api/src/modules/identity/docs/database.md)
- [Approval 数据库设计](../../apps/api/src/modules/approval/docs/database.md)
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
