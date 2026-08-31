# 迁移就绪门禁

CI 通过 `pnpm migration:check` 拒绝禁止的历史表结构、未注册的持久表、格式错误的 up/down 配对以及历史 migration 变更；仅用于失败前置校验的临时表不登记为领域表。持久表注册以 `scripts/check-migration-readiness.mjs` 为自动化事实来源，业务语义由 [Production 数据库设计](../../../apps/api/src/modules/production/docs/database/README.md) 等所有者文档维护。

需求表支持 `normal/manual_additional/scrap_supplement/material_loss_supplement`；业务状态只允许 `active/cancelled`。补料单直接拥有补料需求，不再注册重复的补料明细表。`item_scrap` 当前只允许 `production_consumed` 生产领料损耗；不得据此恢复 `source_scrap_id`，也不得开放仓库已分配报废、退料后报废或库存内报废接口。

PR CI 还会执行格式检查、文档检查、架构检查、迁移就绪检查、密钥检查、依赖检查、构建检查、类型检查、单元测试和新鲜迁移检查。未完成阶段的 Production 和 warehouse UI 警告暂不作为迁移完成信号。
