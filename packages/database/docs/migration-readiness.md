# 迁移就绪门禁

运行 `pnpm migration:check` 检查禁止的历史结构、未登记的持久表、up/down 配对和历史 migration 变更。检查实现与持久表登记见 [check-migration-readiness.mjs](../../../scripts/check-migration-readiness.mjs)；只用于失败前置校验的临时表不登记为领域表。

失败时按输出核对文件配对、表所有权及当前追加规则，不能通过改已执行 migration 消除错误。业务语义由[各表所有者](../README.md#业务数据库设计)维护。此静态检查不证明迁移已执行、可回滚或业务已验收，运行验证见[迁移安全](migration-safety.md#验证边界)，完整 CI 门禁见[测试策略](../../../docs/testing-strategy.md)。
