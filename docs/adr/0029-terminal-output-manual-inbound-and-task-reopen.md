# ADR-0029：终检待入库、人工归批与任务恢复

状态：Accepted。设计已批准，手工验收与正式测试仍按[路线图](../roadmap.md#追踪卡工作台实验待验收)推进。

## 选择与理由

逐盘终检与实物交仓发生在不同时间，终检只记录产出，仓管选择同任务、同成品的多条整笔产出入到一个新批次或本任务已有批次。来源逐笔保留，避免每盘自动建批，同时保留数量及追踪卡来源。产出、原始入库与当前库存分别按各自事实汇总，后续库存补差不改历史生产记录。

计划是安排和差额对照，实际产出、入库及任务／工单完工不受计划量硬约束；继续生产沿普通任务执行，不建补产授权、登记或专属类型。任务累计分配超工单计划仅提示，允许在短产或提前结束后独立安排新任务，同时保留旧任务计划和恢复执行的可能；不通过实际产出推算或释放计划额度。统计与创建边界由[工单与任务](../../apps/api/src/modules/production/docs/database/work-orders-and-batches.md)维护。研发允许多次产出。

任务正常完工核验执行事项已处理，提前结束保留未完成卡，后续可恢复；恢复不复活已释放预留、关闭需求、取消单据或历史作废卡。使用既有操作审计追溯状态动作，不新增状态历史表。未入库产出通过追加撤销事实更正；已入库产出不撤销，库存差异仍经其他出入库处理。

## 取代范围与所有者

取代 [ADR-0027](0027-tracking-card-workbench-and-terminal-output.md) 中终检即库存、每产出独立建批、研发每任务一次产出、任务结束作废未完卡且不能恢复的边界，以及 [ADR-0012](0012-work-order-material-configuration.md) 和 [ADR-0014](0014-task-material-policy-and-output-inspection.md) 中计划分配硬上限及终止释放计划额度的边界。任务及工单完工不再要求产出达到计划。路线快照由创建时冻结改为独立下达时一次生成，使草稿仅调整引用，无需删除重建生产工序；下达后计划调整也不回写已有用料事实。编辑和下达边界由[工单与任务](../../apps/api/src/modules/production/docs/database/work-orders-and-batches.md)维护；异常结算、整盘报废及领退料规则保留。

Production 拥有产出、撤销、任务及工单生命周期和来源资格，规则见[追踪卡](../../apps/api/src/modules/production/docs/database/execution-traceability-quality.md)、[任务生命周期](../../apps/api/src/modules/production/docs/database/production-termination.md)与[成品入库](../../apps/api/src/modules/production/docs/database/finished-goods-inbound.md)。Inventory 拥有实际批次、单据和唯一库存账本，锁序及原子性见[协作协议](../inventory-extraction-design.md)。

## 数据升级边界

在现有实验库上保留数据增量升级，不沿用旧实验的清空边界。旧正数产出须已有完整匹配的实际入库事实，迁移预检不一致即停止；已入库数量直接沿既有来源计算，不回填虚构的待入库或撤销事实。旧结束方式未知保持为空，旧卡、需求、预留和单据不推测恢复。新增能力不可无损降回旧语义时拒绝 down，停写、备份及恢复遵守[迁移安全](../../packages/database/docs/migration-safety.md)。
