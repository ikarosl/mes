# 未解决冲突索引

这里只记已发现、仍待处理的冲突。每项写明哪些文档、代码、测试或 migration 互不一致，影响什么，以及还需谁确认或修改。相关内容核对一致后即移除该条，修订历史可在 Git 中查阅。

## Product 人员候选入口

[Product 候选权限规则](../apps/api/src/modules/product/docs/product-rules.md)仍声明 `/api/product/users/options` 供工艺路线和生产任务选择负责人，[权限测试](../apps/api/src/modules/product/presentation/http/__tests__/product.controller.test.ts)也保留 `userOptions`；当前 [ProductController](../apps/api/src/modules/product/presentation/http/product.controller.ts)没有该方法。双方不一致导致对应测试类型检查失败。待明确该入口的退役边界及人员候选归属后，由 Product 同步所有者文档与权限测试；不据此恢复旧接口或删除权限覆盖。

## 库存余额的测试清理边界

[Inventory 余额规则](../apps/api/src/modules/inventory/docs/database/inventory-ledger-and-inbound.md#71-inventory_batch_balance)要求拒绝负余额，测试清理例外限于隔离库。[库存基线触发器](../packages/database/migrations/202611020312-baseline-inventory-triggers.up.sql)对流水检查库范围，对批次余额、精确版本余额的四处防负校验仅检查会话状态。需由 Inventory 核对两处投影的保护范围及存量余额，再确定增量约束。

## 到站完成记录的报工量

[Production 到站记录](../apps/api/src/modules/production/docs/database/execution-traceability-quality.md#production_tracking_visit)约定在完成时保存盘量。[完成状态 CHECK](../packages/database/migrations/202611090010-production-tracking-workbench.up.sql)在完成分支仅校验数量区间，数量为空时结果为 UNKNOWN；[完成触发器](../packages/database/migrations/202611090040-retire-production-execution.up.sql)对更新另有非空守卫。数据库插入路径仍可表达完成但缺量的记录。需由 Production 核对既有完成记录，明确缺量时可采信的依据及数据库约束。
