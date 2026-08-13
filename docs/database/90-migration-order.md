# 建表与迁移顺序

> [返回数据库设计总览](README.md)。本章是总览所引用的权威规范组成部分，不是独立副本。

```text
1. departments / users / roles / permissions / user_roles / role_permissions
2. refresh_tokens / operation_logs
2a. http_idempotency_records（平台闭环实施时追加，必须早于首个幂等业务端点启用）
3. technical_files / product_categories / process_steps
4. products（暂不添加 default_route_id 外键）
5. process_routes / process_route_steps
6. 为 products.default_route_id 追加外键
7. product_materials / route_step_materials
8. work_orders / production_batches / batch_step_records
8a. batch_step_reports（追加事实表、迁移历史累计量并移除工序节点的累计数量列）
8b. batch_step_abnormal_dispositions（已追加 migration；同时从 batch_step_records 状态集合移除 abnormal，并同步共享常量和契约）
8c. rework_records（异常批准返工后创建；完成报工通过 completed_report_id 保持来源唯一）
9. item_batch / inbound_order / inbound_detail / inventory_transaction
10. production_item_demand / production_item_allocation
10a. 将 production_item_demand.demand_type 从历史数字代码追加迁移为字符串代码（已与字段、CHECK、共享常量、契约和 Repository 同步；当前 application 只生成 normal）
11. outbound_order / outbound_detail
12. 为 production_item_demand.source_scrap_id 追加外键
13. 追加工序报废、主动补料及 `production_item_demand.source_supplement_detail_id` 模型（`202608130004-production-abnormal-supplement`）
13a. return_order / return_detail / stock_check_order / stock_check_detail（生产退料与盘点最小闭环）
13b. production_material_supplement 激活状态、时间和操作人（`202608130006-production-supplement-activation`）
13c. 历史补产激活后的已完成路线重开回填（`202608130007-production-supplement-reopen-backfill`）
13d. item_scrap（通用报废尚未进入范围）
14. inspection_records（过程检验和最终质量语义未闭环，暂不实施）
15. finished_flow_records（质量放行和入库边界未闭环，暂不实施）
16. 业务闭环后再创建必要的只读汇总视图
```

每一步必须使用新的不可变迁移文件。已执行迁移不得修改；循环依赖的外键在两侧表都创建后通过后续迁移追加。

历史 migration 完成状态：第 1～2 步由首批 migration 完成；2a 由
`202608050001-http-idempotency-records` 追加落地；`202607230001-product-master-data` 合并实施了第 3～7 步
（含 `products.default_route_id` 外键）；第 8 步由 `202607300001-production-core` 落地；8a 由
`202608100001-batch-step-reports` 追加落地。第 8b、10a 步由
`202608110001-production-abnormal-dispositions-and-demand-type-codes` 合并追加落地：对旧工序异常状态和数字需求类型先行失败守卫，迁移当前有效异常报工待办，再收紧相应 `CHECK`。`202608130003-production-rework` 已追加 `rework_records`、同源组合外键和返工权限；异常批准返工、负责人开工与整笔完成已落地，返工取消入口尚未实现。`manual_additional` API 仍需后续实现；已有 migration 文件不得修改，后续新表只能追加新的 migration 文件。

`202608130004-production-abnormal-supplement` 已追加工序报废、主动补料和补料需求来源模型；`202608130005-production-return-and-stock-check` 已追加生产退料与盘点最小闭环；`202608130006-production-supplement-activation` 追加补料单 `activated` 状态、激活时间和操作人，并负责从既有已完成补料出库事实回填激活状态；`202608130007-production-supplement-reopen-backfill` 衔接该历史回填，重开仍欠补产数量的已完成路线工序，保证升级库与新事务路径一致。该状态修正可能立即承接后续报工，因此 down migration 不反向覆盖业务进度。
