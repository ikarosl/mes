# ADR-0012：工单选版与任务引用边界

状态：Partially superseded by [ADR-0014](0014-task-material-policy-and-output-inspection.md)（仅工单锁版与跨任务修改阻断被取代；计划额度与历史事实边界保留）

## 历史工单选版决策（已取代）

批量工单的精确物料选版由工单管理显式保存，任务需求及补料只继承，不再由首次需求决定父工单配置。配置仍使用 `work_order_material_versions` 一份数据，BOM 仍属于 Product，不新增工单审批或 BOM 版本模型。

只要非 cancelled/terminated 任务曾生成任意需求，整个工单配置禁止修改，正常完工历史也阻断。未执行任务取消、已领料任务完成提前收尾批准后，可以释放引用并重新配置；旧需求、精确版本、库存与产出事实保持原样。研发任务仍允许任务内多版本。

## 仍有效的计划额度与历史事实边界

工单分配上限按排除 cancelled/terminated 后的任务计划计算，closing 和 completed 继续占用。终止历史计划独立显示，已批准产出继续累计，不从重新分配额度扣减；此上限不保证累计产出不超过工单计划。配置、需求、任务创建和终态变更以工单锁协调。

## 依据与影响

避免子任务隐式决定父工单、错误选版无纠正入口，以及终止任务仍占用全部计划而无法重建的问题。以取消或收尾作为明确边界，不引入正常需求原位换版、影子表或历史事实重写。字段、接口、并发及迁移规则见[工单所有者设计](../../apps/api/src/modules/production/docs/database/work-orders-and-batches.md)。

## 当前适用边界

工单选版配置和跨任务修改阻断已由任务初配冻结取代；不得依据上方历史决策恢复 `work_order_material_versions` 或工单配置入口。批量每任务独立选版，研发无 BOM 与统一版本锁。有效任务计划合计仍受工单额度约束，取消／终止释放额度，实际产出保留历史且允许计划外产出。当前字段、命令及约束见 [工单所有者设计](../../apps/api/src/modules/production/docs/database/work-orders-and-batches.md)。
