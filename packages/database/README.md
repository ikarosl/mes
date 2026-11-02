# packages/database

数据库基础设施包，负责 MySQL 连接池、事务上下文、migration/seed 运行器和数据库初始化命令。它集中承载 migration 文件，但不拥有任何业务模块的表设计；业务所有者索引见下方“业务数据库设计”。

## 导出能力

- `createDatabasePool`：按统一配置创建 MySQL 连接池，并把会话时区设置为 `+08:00`。
- `withTransaction`：提供可嵌套复用的单数据库事务边界；连接默认不可复用，仅在提交或回滚成功后归还连接池，回滚失败销毁连接并保留原始异常。
- `registerAfterCommit`：仅在活动事务登记通用任务；最外层成功提交及释放连接后异步调度，回滚丢弃，清除事务上下文并隔离任务错误。
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

| 根命令 | 用途 |
| --- | --- |
| `pnpm db:ensure` | 按环境配置创建不存在的数据库 |
| `pnpm db:migrate` | 应用 schema 与版本化权限目录，不创建角色或账号 |
| `pnpm db:migrate:status` | 只读查询 pending／running／applied／failed；未完成、文件缺失或校验和异常均失败 |
| `pnpm db:seed` | 幂等写入无凭证的系统基础数据 |
| `pnpm db:bootstrap-admin` | seed 后按 ADMIN_* 创建／更新管理员，重跑会重置其密码 |
| `pnpm db:init` | 依次 ensure、migrate、seed、bootstrap-admin；生产仅升级 schema 时不使用此入口 |

初始化采用按模块、按依赖阶段执行的固定基线；基线之前的开发库须重建，不提供保留旧数据的升级路径。之后数据库变更只能追加成对 migration，基线及已执行文件不可修改。注册与校验见[迁移顺序](docs/90-migration-order.md)、[迁移门禁](docs/migration-readiness.md)，失败处理见[迁移安全](docs/migration-safety.md)。

权限目录的版本快照随 migration 发布，元数据源为 [constants 显式目录](../constants/src/permission-catalog.ts)；通配管理员基础数据与验收职责账号分别由 [seed](seed/README.md) 和 [demo](demo/README.md) 恢复，不将既有角色配置当作运行前提。

开发与 CI 的运行器使用 `tsx src/*.ts`；对应 `*:compiled` 包脚本使用 `node dist/*.js`，只消费构建产物。两类公开脚本均由 Turbo 先构建 workspace 依赖，`:run` 后缀是内部调度任务，不作为独立执行入口。生产镜像的产物与迁移调用见[发布手册](../../ops/runbooks/compose-server-deployment.md#独立发布)。

导入 `ensureDatabaseExists` 不会自动连接数据库。

## 迁移登记表 `_schema_migrations`

职责：保存迁移身份、内容校验和及执行状态，防止重复执行、历史 SQL 被改写和中断后盲目重跑。它不保存实际业务表结构，也不代表 schema 已通过核验。

本表由本包的[迁移运行器](src/migration-runner.ts)在确认空库后创建，属于数据库基础设施，不归任何业务模块所有。使用 InnoDB、`utf8mb4_0900_ai_ci`；已有旧登记结构不自动升级。

| 字段 | 类型 | 允许 NULL | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `name` | `VARCHAR(255)` | 否（主键隐含） | 无 | 已执行的 `.up.sql` 文件名，包含扩展名；不自增 |
| `checksum` | `CHAR(64)` | 否 | 无 | 迁移 SQL 文件内容的 SHA-256 十六进制校验和 |
| `status` | `VARCHAR(16)` | 否 | `running` | running／applied／failed；DDL 开始前写入 running |
| `started_at` | `DATETIME` | 否 | `CURRENT_TIMESTAMP` | 开始尝试执行的时间 |
| `applied_at` | `DATETIME` | 是 | NULL | SQL 全部成功后登记；其他状态必须为空 |
| `error_code` | `VARCHAR(64)` | 是 | NULL | 失败时尽力保存的驱动错误码，不保存 SQL 或业务数据 |

主键为 `name`；两个 CHECK 限定状态及完成时间与状态一致，没有额外唯一键、二级索引或外键。`checksum` 的摘要算法、已执行文件内容不可变及登记必须是迁移顺序的连续前缀由运行器校验。本表不继承业务审计、乐观锁或软删除字段。

执行及状态查询先核对全部登记：文件缺失、校验和不符或顺序缺口即失败；非空但没有登记的库也拒绝初始化。该检查不证明实际 schema 与登记一致；源码历史变更由[工程门禁](docs/migration-readiness.md)通过 Git 比较。

迁移在建议锁内先持久化 running，再执行整份 SQL，成功后改为 applied；失败尽力改为 failed，连接中断可能保留 running。两种未完成状态均阻止下一次执行，禁止自动 down 或自动重试。状态查询只读，存在非 applied 状态时退出码为 1。DDL 与登记不能整体回滚，恢复及人工核验边界见[迁移安全](docs/migration-safety.md)。

## 业务数据库设计

migration 的物理位置不表示业务所有权。业务表设计跟随代码所有者维护：

- [Identity 数据库设计](../../apps/api/src/modules/identity/docs/database.md)
- [Approval 数据库设计](../../apps/api/src/modules/approval/docs/database.md)
- [Notification 数据库设计](../../apps/api/src/modules/notification/docs/database.md)
- [Product 数据库设计](../../apps/api/src/modules/product/docs/database.md)
- [Template 数据库设计](../../apps/api/src/modules/template/docs/database.md)
- [Procurement 数据库设计](../../apps/api/src/modules/procurement/docs/database.md)
- [Quality 数据库设计](../../apps/api/src/modules/quality/docs/database.md)
- [Inventory 数据库设计](../../apps/api/src/modules/inventory/docs/database.md)
- [Production 数据库设计](../../apps/api/src/modules/production/docs/database/README.md)
- [平台操作审计](../../apps/api/docs/audit.md)
- [平台业务编号](../../apps/api/docs/business-numbering.md)
- [平台 HTTP 幂等](../../apps/api/docs/idempotency.md)
- [跨模块数据库约定](../../docs/database-conventions.md)

## 验证

```text
corepack pnpm --filter @company/database test
corepack pnpm --filter @company/database typecheck
corepack pnpm migration:check
```

迁移逐项的暂停写入、非空守卫、回滚限制和恢复方式见[迁移安全](docs/migration-safety.md)；各表职责、结构、关系及设计理由由上方所有者文档与 migration 同步维护。migration 文件存在不表示目标数据库已执行，实际状态通过 `db:migrate:status` 查询。
