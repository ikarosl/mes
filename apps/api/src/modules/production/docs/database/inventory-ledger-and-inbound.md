# 库存批次、库存流水与入库

库存批次、入库主从表、流水及余额投影由 Inventory 唯一所有，准确字段与约束见 [Inventory 库存设计](../../../inventory/docs/database/inventory-ledger-and-inbound.md)。生产分配、领料、退料及成品入库接口保留，Production 通过公开库存能力校验批次并记账，不直接写库存表。

本章入口只读采购入库历史、库存批次与物料供需；供需由 Production 组合需求与 Inventory 公共事实。外购实际确认使用 Procurement 的当前正式分配，不提供独立手工创建、确认或取消采购入库的命令与请求契约。

| GET 路径（省略 `/api/production`） | 权限 | 消费者 |
| --- | --- | --- |
| `/purchase-inbounds`、`/purchase-inbounds/:inboundId` | `warehouse:inbound:view` | 仓储采购入库历史列表与详情 |
| `/inventory-batches`、`/inventory-batches/:itemBatchId` | `warehouse:inventory:view` | 库存页批次列表、详情及来源追溯 |
| `/inventory-material-supply-demand`、`/inventory-material-supply-demand/:itemId/demands` | `warehouse:inventory:view` | 库存页精确版本供需及活动需求下钻 |

读取归属仓储职责，但接口继续由 Production 场景编排或转调 Inventory；权限分组不改变 URL、表所有权或来源命令校验。采购实际确认的独立动作见 [Procurement](../../../procurement/docs/receipts.md#事务权限与防重)，成品确认见[成品入库](finished-goods-inbound.md#http-查询与权限)。

生产需求、预留、领料履约与退料／损耗额度仍属于 Production，见[需求与出库](demand-allocation-and-outbound.md)及[退料与损耗](return-scrap-and-stocktake.md)。成品当前轮批准授权及分次确认见[成品入库](finished-goods-inbound.md)。

采购到货及实收修订归 Procurement，来料检验与复核归 Quality，仓管按当前轮、有效明确放行记录及正式可入分配余量调用 Inventory 分次入库；模块协作见[采购技术设计](../../../../../../../docs/procurement-inbound-design.md)。本目录只维护生产来源编排，不重复定义库存字段。
