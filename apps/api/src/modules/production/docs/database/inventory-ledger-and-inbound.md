# 库存批次、库存流水与入库

库存批次、入库主从表、流水及余额投影已由 Inventory 唯一所有，准确字段与约束见 [Inventory 库存设计](../../../inventory/docs/database/inventory-ledger-and-inbound.md)。原生产接口继续保留，Production 通过公开库存能力办理分配／领料／退料及成品入库，不直接写库存表。

生产需求、预留、领料履约与退料／损耗额度仍属于 Production，见[需求与出库](demand-allocation-and-outbound.md)及[退料与损耗](return-scrap-and-stocktake.md)。成品批准来源和类别一次确认见[成品入库](finished-goods-inbound.md)。

采购到货和强制检验仍按[采购技术设计](../../../../../../../docs/procurement-inbound-technical-design.md)接入；提取不等于采购流程已完成，不保留两份库存字段定义。
