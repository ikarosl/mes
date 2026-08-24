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
13d. 报工异常来源、工序报废补产授权、补料需求去重及补料单 `fulfilled` 物流状态（`202608200001-production-scrap-reproduction-authorization`）
13e. 生产领料损耗、补料单双来源及 `material_loss_supplement` 需求类型（`202608200002-production-material-loss-supplement`）
13f. 当前全部业务数量列追加整数 `CHECK`，拒绝历史和新增小数（`202608240001-integer-production-quantities`）
13g. 工单与生产批次追加可查询的取消/关闭终态事实，并从成功操作日志回填历史可恢复数据（`202608240002-production-terminal-facts`）
13h. 入库、出库、退料、盘点和损耗单追加可查询的取消终态事实，出库单区分人工与生产任务级联来源（`202608240003-production-document-cancellation-facts`）
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

`202608200001-production-scrap-reproduction-authorization` 在不修改上述历史文件的前提下追加演进：报工记录增加异常来源；新增 `batch_step_scrap_reproduction_authorization`；既有补料明细无损折叠到 `production_item_demand.supplement_id` 后删除重复表及原因字段；需求状态收紧为 `active/cancelled`；补料单 `activated` 更名为只表达物流齐套的 `fulfilled`。回滚前若已产生前置异常或物料截止早于额度截止的授权会失败守卫，避免丢失新语义。

`202608200002-production-material-loss-supplement` 按已定稿口径创建只支持 `production_consumed` 的 `item_scrap`；将 `production_material_supplement.scrap_record_id` 语义化重命名为 `step_scrap_record_id`，新增 `source_type/material_loss_scrap_id/version/updated_by/updated_at` 并把历史行回填为 `step_scrap_reproduction`；同时扩展 `production_item_demand.demand_type` 为 `material_loss_supplement`，追加报废管理 RBAC。该迁移没有开放 `warehouse_allocated/return_after_outbound/in_stock` 报废结构或命令。

`202608200003-production-scrap-supplement-plan` 新增 `production_scrap_supplement_plan` 与 `production_scrap_supplement_plan_line`，把正式批准报废前可反复编辑的补料方案与 `production_item_demand` 正式需求事实隔离。方案明细只保存管理员填写数量，不自动计算推荐量；草稿查询、乐观锁整体保存、原子确认接口与管理端恢复接线已经落地。

`202608240001-integer-production-quantities` 按 2026-08-24 最终业务决策，为 BOM、工单、批次、需求、报工、分配、出入库、退料、损耗、补产授权、返工和盘点的现存数量列追加整数 `CHECK`。迁移保留 `DECIMAL(12,4)` 兼容表示，但任何非零小数位都会被拒绝；升级库若已有小数会在添加约束时失败，必须先由业务人工确认并修正，migration 不做自动舍入或截断。`products.spec_values` 等纯 JSON 记录不在本迁移范围内。

`202608240002-production-terminal-facts` 为 `work_orders` 追加草稿取消事实和关闭类型、原因、操作人、时间，为 `production_batches` 追加取消事实；迁移从对应成功 `operation_logs` 回填能够恢复的历史数据，无法恢复的历史原因保持 `NULL`，不虚构业务事实。新命令在同一业务主表更新中写入终态字段，并继续与成功操作日志同事务提交。

`202608240003-production-document-cancellation-facts` 为 `inbound_order`、`outbound_order`、`return_order`、`stock_check_order` 和 `item_scrap` 追加取消原因、操作人和时间。`outbound_order.cancel_source` 区分人工取消与生产任务级联取消；级联路径继承生产任务取消原因。迁移从成功操作日志回填可靠的历史操作人和时间，并根据独立出库取消日志或生产任务日志中的 `cancelledPendingOutboundIds` 恢复出库单取消来源；历史原因不稳定可得，因此不虚构或回填原因。
