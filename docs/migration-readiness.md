# Migration Readiness Gate

Before a production or inventory migration can be introduced, CI requires `pnpm migration:check`. The check rejects prohibited legacy models, unregistered tables, malformed up/down pairs and changes to historical migrations. Registered Production 第一阶段表为 `work_orders`、`production_batches`、`batch_step_records` 和 `production_item_demand`；其所有权为 Production 模块，所有可变单据均使用 `version` 乐观锁，物料需求使用稳定幂等键。生产物料分配、领料出库及其他库存表须在对应阶段先登记所有权与业务规则后才能追加 migration；语义业务规则仍需测试和评审。

PR CI also runs format, documentation, architecture, migration-readiness, secret, dependency, build, type, unit and fresh-migration checks. 未完成阶段的 Production 和 warehouse UI 警告暂不作为迁移完成信号。
