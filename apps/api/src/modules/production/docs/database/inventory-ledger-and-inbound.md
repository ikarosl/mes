# 库存批次、库存流水与入库

库存批次、入库主从表、流水及余额投影由 Inventory 唯一所有，准确字段与约束见 [Inventory 库存设计](../../../inventory/docs/database/inventory-ledger-and-inbound.md)。生产分配、领料、退料及成品入库接口保留，Production 通过公开库存能力校验批次并记账，不直接写库存表；旧手工外购创建、确认和取消入口已移除。

生产需求、预留、领料履约与退料／损耗额度仍属于 Production，见[需求与出库](demand-allocation-and-outbound.md)及[退料与损耗](return-scrap-and-stocktake.md)。成品批准来源和类别一次确认见[成品入库](finished-goods-inbound.md)。

采购到货及实收修订归 Procurement，来料检验与复核归 Quality，仓管按当前轮、有效明确放行记录及正式可入分配余量调用 Inventory 分次入库；模块协作见[采购技术设计](../../../../../../../docs/procurement-inbound-technical-design.md)。本目录只维护生产来源编排，不重复定义库存字段。
