# 任务开始与结束

任务生命周期由 Production 拥有，任务主表结构见[工单与任务](work-orders-and-batches.md)，逐盘执行、异常和最终产出见[追踪卡](execution-traceability-quality.md)。数量达到计划不会自动完成任务。

## 管理员任务开工与物料阶段

批量任务必须完整确认初始 BOM 需求基础，研发任务至少曾有一条正式手工需求，才能开始。需求已履约或已关闭仍是曾配置事实。开始不要求领料齐套；当前有未领需求时必须填写提前开工说明。首次开工时间、账号、说明及需求／已领／未领快照同事务保存，后续不覆盖；工单原为 released 时一并进入 doing。

POST /production/batches/:batchId/actions/start 使用任务 version，要求 production:batches:transition 和 Idempotency-Key。开工后任务 doing，后续领料不回退到物料阶段。现场人员到站身份与任务开工账号分别记录。

## 人工结束与收口

POST /production/batches/:batchId/actions/finish 使用当前任务 version、必填原因和 Idempotency-Key，要求 production:batches:transition。所有非终态任务可以明确结束，包括尚未开工、短产、零产出或提前停止的任务；不要求卡数、逐站数量或最终产出达到计划，也不补造零产出确认事实。

结束事务先阻断在途需求更正审批、待确认退料和待确认领料损耗，要求先办理或取消这些单据。存在盘量为零且异常未结算的卡时，也须先完成关联报废结算，不能通过结束任务将其作废。随后通过 Inventory 公开能力取消待领料出库单，释放有效物料预留，以 task_finished 原因关闭活动剩余需求，并把正量未使用或流转中的卡作废。已整盘报废的卡保持 scrapped；已完成领料、退料、交接、异常、更正和最终产出均保留。需求原始数量和已领事实不回退，后续库存补差不回写产出。

最后同一事务将任务转为 completed，保存结束原因、结束账号、完成时间、版本和成功审计。任务结束后的短产或零产出仍如实展示，不转成“足量生产”。任务状态不自动推进工单完工；工单另由其显式命令复核。已结束任务不恢复执行，也不自动恢复已关闭需求或释放的预留；下一项工作另建任务并遵守工单计划额度。

## 未执行任务取消

取消仍用于尚未开工、没有实际领料的 pending/material_pending/material_assigned 任务，要求当前版本和原因。取消一并取消待领料单、分配及活动需求，并作废尚未使用的卡；存在实际领料或已到站执行则拒绝，须使用人工结束。取消不产生库存反向流水。

## 研发最终产出

研发任务没有路线和追踪卡；在 doing 时登记当前启用的现场人员，通过 confirm-research-output 显式确认一次最终可用产出，允许零。正数量与实际成品入库同事务，零数量不记库存。提前结束允许没有产出事实，不推测历史质量结论。结构和唯一性见[最终产出表](execution-traceability-quality.md#production_tracking_output)。

## 库存与余料

任务结束只停止新执行和未履约安排，不把已领物料推算成现场库存。真实余料可在任务或工单结束后沿原分配办理退料，具体额度见[退料与损耗](return-scrap-and-stocktake.md)。实际出入库及库存余额继续只由 Inventory 所有，公共锁序见[库存协作](../../../../../../../docs/inventory-extraction-design.md)。
