# 成品入库协作

成品实际产出由 Production 的[最终确认事实](execution-traceability-quality.md#production_tracking_output)唯一提供。批量每盘确认一次，研发每任务确认一次；正数在同一事务通过 Inventory 公开能力直接入库，零数只保存确认事实。

不再建立批准产出清单、计划内／外授权分配、成品检查轮次或“批准后待仓管确认”的第二办理阶段。工单计划仍用于计划分配和足量判断，超计划最终产出如实汇总，不拆成另一种库存来源。

Inventory 拥有公共入库单／明细、库批与库存流水，并从 production_output_id 追溯不可变最终确认事实。每笔正数自动创建独立新成品库批，来源为 finished_product；不由 Production 写库存表或覆盖余额。历史入库通过[库存批次及流水](../../../inventory/docs/database.md)查询。库存后续补差或盘点不回写原产出。

身份、锁序和回滚遵守[跨模块规则](cross-module-rules.md)与[库存协作](../../../../../../../docs/inventory-extraction-design.md)，事实结构仅在各所有者维护。
