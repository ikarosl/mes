# 迁移就绪门禁

在引入生产或库存迁移之前，CI 要求执行 `pnpm migration:check`。该检查会拒绝禁止的历史表结构、未注册的表、格式错误的 up/down 配对以及历史迁移的变更。已注册的 Production 第一阶段表为 `work_orders`、`production_batches`、`batch_step_records` 和 `production_item_demand`；其所有权归属于 Production 模块，所有可变单据均使用 `version` 乐观锁，物料需求使用稳定幂等键。当前需求表的物理约束支持正常需求和追加补料；报废补料的 `source_scrap_id` 外键及 `demand_type = 2` 约束须在 `item_scrap` 建表后以追加 migration 启用。生产物料分配、领料出库及其他库存表须在对应阶段先注册所有权与业务规则后，才能追加迁移；语义业务规则仍需测试和评审。

PR CI 还会执行格式检查、文档检查、架构检查、迁移就绪检查、密钥检查、依赖检查、构建检查、类型检查、单元测试和新鲜迁移检查。未完成阶段的 Production 和 warehouse UI 警告暂不作为迁移完成信号。
