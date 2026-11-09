# 仓储只读入口

库存、库批、公共出入库和盘点由 [Inventory](../../../inventory/docs/database.md)拥有，Production 不保存第二份账本或可写汇总。本章只说明现有仓储宿主与只读入口；生产物料需求及预留见[需求设计](demand-allocation-and-outbound.md)。

GET /production/inventory-batches 和 /inventory-batches/:itemBatchId 返回分页库批及流水历史，按 warehouse:inventory:view 或 warehouse:inbound:view 任一权限放行，供库存页和成品入库历史共用。成品来源通过不可变最终产出 ID 追溯任务及追踪卡，不再依赖旧批准版或计划内外分配。物料、精确版本、库存状态及数量仍以 Inventory 的公开查询为准。

GET /production/purchase-inbounds 及详情继续读取采购实际入库，仅 warehouse:inbound:view。采购到货、质量检查或可入分配本身都不构成库存；只有已实际入库的公共单据形成流水。

供需列表按物料及精确版本计算公共可用库存、Production 活动需求和缺口，分页筛选先于返回；它不自动采购、分配或决定任务执行。来源只读查询登记在[数据所有权](../../../../../../../scripts/api-data-ownership.mjs)，命令必须通过所属模块公开能力重新校验。
