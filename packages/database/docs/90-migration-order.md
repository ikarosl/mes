# Migration 顺序与注册规则

> [返回数据库基础设施包](../README.md)。业务表语义不在本文件维护。

## 事实来源

`packages/database/migrations/*.up.sql` 按完整文件名升序组成唯一 migration 注册表；同名
`.down.sql` 提供配对回滚 SQL。`src/migration-utils.ts` 负责读取、计算校验和及共用的已执行记录检查，`src/migrate.ts` 按注册顺序执行尚未登记的迁移，
`src/migrate-status.ts` 报告 pending／running／applied／failed；检查行为及登记规则见[迁移登记表](../README.md#迁移登记表-_schema_migrations)。当前运行器只执行 up，没有自动 down／rollback 或强制标记完成命令。

文档不重复枚举 migration 文件或完成状态，避免注册表演进后产生第二份过期清单。查看当前顺序使用：

```text
corepack pnpm db:migrate:status
```

## 初始化基线

当前初始化基线为 `20261102`，按模块保留完整结构与业务约束。文件按以下阶段全局排序，不能独立初始化某一个模块：

1. 各模块建表，包含最终字段、主键、索引、CHECK。
2. 各模块添加外键，处理相互引用及循环依赖。
3. 各模块创建触发器，保留同一事件的执行顺序和创建时 SQL／字符集环境。
4. 写入固定版本的权限目录；system seed、管理员初始化与可选 demo 继续使用原入口。

基线之前的开发升级路径退出支持，旧 SQL 原文和回滚限制由 Git 历史保存，不进入当前运行链。旧环境须保留所需备份后另建空库，以匹配当前代码的 `db:init` 初始化；迁移命令不会清库、删除旧登记或把旧库自动认定为新基线。基线初始化也不迁移旧业务数据。

基线及之后的增量构成唯一活动注册表，后续仍按下方规则追加；不把基线当作可随时编辑的建表模板。文件历史由 Git 保存，不维护额外的基线文件清单或摘要副本。运行器直接读取 migration 目录，并按数据库中的执行登记核对文件身份与校验和。

该边界也退出旧链完整 down 的支持；旧链曾有重复外键缺陷，不将其退役解释为缺陷已修复。当前基线 down 仅用于受控空业务库验证，正式环境恢复以[迁移安全](migration-safety.md)为准。

## 追加规则

1. 文件名使用 12 位数字时间序号加 kebab-case 目的名；完整迁移基名（时间序号与目的名）全局唯一，并同时添加 `.up.sql`、`.down.sql`。数字前缀可因多分支开发重复，不单独作为迁移身份；运行器以完整 `.up.sql` 文件名登记已执行记录。
2. 已进入注册表或已在任一环境执行的 migration 不得修改、重命名或重排；修正只能追加新文件。
3. 有先后依赖的 migration 必须确保完整文件名排序满足依赖。被引用表、唯一键和必要索引必须先创建；循环外键在两侧对象存在后通过后续 migration 追加。
4. 数据回填先于非空、唯一键、外键或收紧后的 `CHECK`；无法无损推导时应失败并要求人工处置，禁止猜测业务事实。
5. 破坏性 down migration 必须设置数据守卫。回滚会覆盖后续业务进度时，应明确拒绝回滚。
6. migration 的物理集中不改变表所有权；字段、约束、索引、关系或业务含义变化时，同步更新所属数据库设计及受影响的所有权登记，遵守[数据库文档要求](../../../docs/database-conventions.md#数据库设计文档)。

## 所有者与验证

- 业务表所有者：[数据库设计索引](../README.md#业务数据库设计)，覆盖 Identity、Product、Production、Inventory、Procurement、Quality、Approval 与 Notification。
- 平台表：[操作审计](../../../apps/api/docs/audit.md)、[HTTP 幂等](../../../apps/api/docs/idempotency.md)
- 公共字段与约束：[数据库公共约定](../../../docs/database-conventions.md)

提交前执行：

```text
corepack pnpm migration:check
corepack pnpm --filter @company/database test
```

升级和回滚的部署约束、具体迁移的依赖顺序、非空守卫及不可单独运行的准备状态见[迁移安全](migration-safety.md)，静态注册门禁见[迁移就绪检查](migration-readiness.md)。
