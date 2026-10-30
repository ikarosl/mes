# Production 数据库设计

本目录逐表维护设计职责、字段类型与空值／默认、键、索引、约束及业务不变量，并与对应 [migration](../../../../../../../packages/database/migrations/) 同步。公共出入库、库存与盘点归 [Inventory](../../../inventory/docs/database.md)。公共字段、数量、历史身份及审计遵守[数据库约定](../../../../../../../docs/database-conventions.md)，HTTP 协议与幂等遵守[API 规范](../../../../../../../docs/api-conventions.md)及[平台契约](../../../../../docs/idempotency.md)。

字段表保留 SQL 定义；未标 `NOT NULL` 的列允许空值，未声明默认值的可空列默认 NULL，无默认且不自动生成的必填列由命令提供。键表列出迁移显式定义的约束和索引；未显式建索引的外键由 MySQL 建立必要的支撑索引。特殊触发器与跨表规则在所属表正文说明。

## 章节

1. [工单与生产批次](work-orders-and-batches.md)
2. [库存批次、库存流水与入库](inventory-ledger-and-inbound.md)
3. [生产需求、分配与领料出库](demand-allocation-and-outbound.md)
4. [退料、生产领料损耗与盘点](return-scrap-and-stocktake.md)
5. [生产执行、报工、追溯与质量边界](execution-traceability-quality.md)
6. [批次结束与本轮产出处置](production-termination.md)
7. [跨模块规则、关系与锁序](cross-module-rules.md)
8. [成品身份、生产流转与额外产出入库](finished-goods-inbound.md)

## 使用规则

各表只在所属专题维护；跨模块协议不复制其他模块的字段或办理资格。标记为未来设想的状态转换、完整质量等不属于当前能力，范围见[产品范围](../../../../../../../docs/product-scope.md)。
