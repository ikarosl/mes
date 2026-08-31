# Production 数据库设计

本目录是 Production 业务表、状态和跨表事务不变量的权威设计。migration 统一登记在 `packages/database/migrations`，不改变 Production 对这些业务数据的所有权。

## 章节

1. [工单与生产批次](work-orders-and-batches.md)
2. [库存批次、库存流水与入库](inventory-ledger-and-inbound.md)
3. [生产需求、分配与领料出库](demand-allocation-and-outbound.md)
4. [退料、生产领料损耗与盘点](return-scrap-and-stocktake.md)
5. [生产执行、报工、追溯与质量边界](execution-traceability-quality.md)
6. [核心汇总视图](summary-views.md)
7. [跨模块规则、关系与锁序](cross-module-rules.md)

## 使用规则

- `inventory_transaction` 是库存数量唯一事实来源；余额和汇总只能由事实重建。
- `production_item_demand` 是生产需求唯一事实来源。
- 表字段定义只在所属章节维护；跨表事务、锁序和跨模块引用集中在规则章节。
- Identity 与 Product 数据只能通过其公开能力使用；本目录不得复制其表定义。
- 标记为待决策或边界预留的 Quality、通用 Inventory、成品流转能力不得提前实现。
- 所有章节同时遵守[跨模块数据库约定](../../../../../../../docs/database-conventions.md)。
