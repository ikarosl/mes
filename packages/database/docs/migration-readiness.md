# 迁移就绪门禁

运行 `pnpm migration:check` 检查文件命名格式、禁止的历史结构、未登记的持久表、up/down 配对和历史 migration 变更。数字前缀重复不属于门禁冲突，迁移身份与依赖顺序遵守[迁移追加规则](90-migration-order.md#追加规则)。检查实现与持久表登记见 [check-migration-readiness.mjs](../../../scripts/check-migration-readiness.mjs)；只用于失败前置校验的临时表不登记为领域表。

每份 `.up.sql` 必须有同名 `.down.sql`，反向也检查，不能只留一个方向。检查直接读取 migration 目录，不另存文件或哈希清单。

设置 `MIGRATION_BASE_SHA` 时，以该提交与 HEAD 的共同祖先为基点，通过 Git 比较当前工作树：既有 migration 的修改、删除和重命名均拒绝，新文件必须排在既有迁移之后；没有历史文件删除豁免。PR 的 CI 提供目标分支 SHA，未设置该变量时只检查当前文件。已部署环境的文件身份、内容校验和与执行状态由[运行器](../README.md#迁移登记表-_schema_migrations)继续核验。

失败时按输出核对文件配对、表所有权及当前追加规则，不能通过改已执行 migration 消除错误。业务语义由[各表所有者](../README.md#业务数据库设计)维护。此静态检查不证明迁移已执行、可回滚或业务已验收，运行验证见[迁移安全](migration-safety.md#验证边界)，完整 CI 门禁见[测试策略](../../../docs/testing-strategy.md)。
