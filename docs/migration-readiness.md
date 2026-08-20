# 迁移就绪门禁

在引入生产或库存迁移之前，CI 要求执行 `pnpm migration:check`。该检查会拒绝禁止的历史表结构、未注册的持久表、格式错误的 up/down 配对以及历史迁移的变更；migration 内只用于失败前置校验的临时表不登记为领域表。当前已注册的 Production 表以 `scripts/check-migration-readiness.mjs` 和 `docs/database/README.md` 为准，所有权归 Production 模块。可变单据和执行节点使用 `version` 乐观锁；`production_scrap_supplement_plan/_line` 是可编辑但不可分配的报废补料方案；`batch_step_reports`、`batch_step_scrap_records` 和 `batch_step_scrap_reproduction_authorization` 是不可变事实；物料需求只以 `production_item_demand` 为事实来源并使用稳定内部键。

需求表支持 `normal/manual_additional/scrap_supplement/material_loss_supplement`；业务状态只允许 `active/cancelled`。补料单直接拥有补料需求，不再注册重复的补料明细表。`item_scrap` 当前只允许 `production_consumed` 生产领料损耗；不得据此恢复 `source_scrap_id`，也不得开放仓库已分配报废、退料后报废或库存内报废接口。

PR CI 还会执行格式检查、文档检查、架构检查、迁移就绪检查、密钥检查、依赖检查、构建检查、类型检查、单元测试和新鲜迁移检查。未完成阶段的 Production 和 warehouse UI 警告暂不作为迁移完成信号。
