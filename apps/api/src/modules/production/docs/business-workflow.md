# 生产业务完整工作流

本文解释业务顺序和各阶段要确认的事实。字段、状态码、权限及事务约束由[数据库专题](database/README.md)维护；实施和验收状态见[路线图](../../../../../../docs/roadmap.md)。

```text
准备成品资料 → 下达工单 → 创建任务 → 提出需求 → 分配预留 → 分次领料
                                                   ↓
批量：管理员开工、派工、工序执行 ───────────────→ 执行结束／提前停止
研发：任务级开始、结束 ──────────────────→ 物料核对和产出草稿
                                                   ↓
Quality 独立检查 → 产线核对清单 → 工单负责人审批 → 仓管实际入库
```

## 一、基础资料准备

### 1. 配置产品分类

Product 分别维护物料和成品分类；不建立独立半成品类型。字段及有效性见 [Product](../../product/docs/database.md)。

### 2. 添加物料或产品资料

物料以精确版本选用，成品有独立身份；基础资料及用途资格由 [Product](../../product/docs/product-rules.md)维护。

### 3. 物料入库

外购按“采购 → 到货 → 检查 → 库管定稿 → 实际入库”形成公共库存。只有实际确认才记库存，到货、检查或采购关联不直接减少生产需求。办理细节见 [Procurement](../../procurement/README.md)和 [Inventory](../../inventory/README.md)。

### 4. 添加标准工序

Product 维护标准工序及 SOP；生产任务使用创建时的快照，不随当前资料回写历史。

### 5. 配置工艺路线

批量任务由人员选择路线，研发不配置工序；路线与历史快照规则见[任务创建](database/work-orders-and-batches.md#工单类型与物料版本规则)。

### 6. 配置成品

批量任务需要已批准且锁定的 BOM；研发只需有效成品，不要求 BOM 或工序。BOM 用于任务用料基础，不把 BOM 行绑定到工序。

## 二、生产计划与派工

### 7. 创建生产工单

明确批量／研发、成品、计划数量及负责人。下达后类型固定并保存成品快照；外部订单号只用于关联查询，可对应多个工单。工单下达审批尚未接入，当前仍按直接下达流程办理；批准的未来目标单独见[工单设计](database/work-orders-and-batches.md#工单审批接入目标结构尚未实施)。

### 8. 创建生产任务

将工单计划拆为任务，再分别办理用料与执行；计划额度、锁版及历史快照见[工单与任务](database/work-orders-and-batches.md)。

### 9. 生成工序执行记录并等待派工

批量任务按冻结路线生成待派工工序，管理员确认办理人后由员工明确开始。派工、改派及 SOP 见[生产执行](database/execution-traceability-quality.md#41-batch_step_records)。

## 三、物料需求、预留与领料

### 10. 批量初配与研发手工提需

批量完整确认 BOM 初始需求，研发手工提需；后续增加用料、补料和正式需求更正使用各自入口，见[需求设计](database/demand-allocation-and-outbound.md)。

### 11. 分配物料并形成库存预留

为具体需求选择库存批次，分配只预留，实际领料才履约。数量和释放资格见[需求分配](database/demand-allocation-and-outbound.md#11-production_item_allocation)。

### 12. 生产领料出库

按一次实际交接制单并整单确认，可随物料备齐分次办理；开工与领齐相互独立，见[领料出库](database/demand-allocation-and-outbound.md#36-生产领料出库表)。

## 四、生产执行与质量闭环

### 13. 生产开工

管理员先明确任务开工，员工再开始已派工工序；需求配置前提与缺料说明见[任务开工](database/work-orders-and-batches.md#管理员任务开工与物料阶段)。

### 14. 工序报工

分别登记正常与异常事实，按实际作业明确完成工序；报工数量不代表最终质量或自动完工。冲销、更正、批量办理及历史纠错见[执行规则](database/execution-traceability-quality.md#cp-01-报工整改边界)。

### 15. 工序检验与返工

Quality 独立登记现场检查，产线承接问题后进入异常处置；管理人员办理整笔返工，正常恢复与再次异常分别留事实。见[专检处理](database/execution-traceability-quality.md#43-工序专检与生产处理)及[返工](database/execution-traceability-quality.md#45-rework_records当前最小返工)。

### 16. 工序异常、报废和补料

报废前先暂存并复核人工补料方案，确认后生成报废、补产授权及正式需求；补料履约后原授权才生效。方案见[需求设计](database/demand-allocation-and-outbound.md#batch_step_scrap_records-与半自动补料)，产品额度见[执行数量模型](database/execution-traceability-quality.md#统一首工上限已确认)。

### 16.1 生产领料损坏登记

按真实已领来源登记损坏；需要额外用料时另提需求，见[损耗设计](database/return-scrap-and-stocktake.md#16-item_scrap)。

### 17. 生产退料：现场余料回仓

将真实可用余料退回原批次，退料不恢复需求履约；来源额度和任务结束后的办理见[退料规则](database/return-scrap-and-stocktake.md#37-退料表)。

## 五、完工与入库

### 18. 生产执行完成与最终结案

正常执行结束与提前停止都进入收尾，处理剩余事项、实核物料、形成产出草稿，再引用 Quality 检验并交工单负责人批准。撤回结束、产出数量、检验差异及审批冻结见[结案设计](database/production-termination.md)。

工单完工与关闭另行核对当前批准产出，不由任务自动代办，见[工单动作](database/work-orders-and-batches.md#生产工单状态与管理动作)。

### 19. 成品入库

仓管按当前批准授权办理实际入库；批准与库存是两个事实，分次消费和历史依据见[成品入库](database/finished-goods-inbound.md)。

#### 后续通用库存与 Quality 边界（未实施，须先评审范围）

待检成品入库、库存状态转换和流转里程碑是后续设想，不属于当前流程，不提前建 `finished_flow_records` 或质量放行表。状态转换的未来接口约束保留于[跨模块边界](database/cross-module-rules.md#库存状态转换尚未实施)，其质量事实须先定稿。

### 19.1 研发轮次结束与产出处置

研发使用同一结案流程；旧工单完成或关闭后，可用不同成品开启后续研发方向，旧轮待入库不阻断续轮。资料带出和历史隔离见[研发轮次](database/work-orders-and-batches.md#研发轮次关联与资料带出)。

#### 轮次与产出的处理

执行过的轮次即使零可用产出也走结案，不能视作未执行取消；报废、零产出和真实入库分别处理，见[产出规则](database/production-termination.md#数量质检与更正)。

#### 计划差额与物料余量由管理员分别核对

管理员实核未领要求、可退余料和实际损坏，不能按成品计划差额乘 BOM 推算耗用、退料或损耗。系统可退额度只是上限，不代表现场仍有这么多物料。例如计划10、实际8且可用3报废5，计划内可用缺口仍为7，实际原材料余量另行核对。

## 六、库存盘点与修正

### 20. 创建库存盘点

盘点由 Inventory 独立拥有，当前范围为已有物料批次和库存状态；不因成品接入而自动开放成品盘点。

### 21. 确认盘点差异

盘点差异通过库存流水调整，不能直接改余额或历史流水。字段、防重和冲销规则见 [Inventory 盘点](../../inventory/docs/database/stock-check.md)。

## 七、核心状态流转

| 对象 | 当前权威状态与命令 |
| --- | --- |
| 工单 | [工单状态](database/work-orders-and-batches.md#生产工单状态与管理动作)：草稿取消、下达、正常完工和关闭分别表达 |
| 任务 | [任务状态](database/work-orders-and-batches.md#5-production_batches)：物料、执行、正常／提前结案分别推进 |
| 工序 | [派工状态机](database/execution-traceability-quality.md#411-派工与执行状态机)：派工、明确开始、明确完成及合法重开 |

实际领料或开工后不再按未执行任务取消；取消也不删除业务历史。状态改变通过所属领域规则及事务，不通过通用可写 status 接口。

## 八、设计边界说明

Production 不建立项目级隔离、现场物料耗用账本、通用库存报废或完整在线质量。路线和检验标记冻结为执行快照，不因有预留字段就开放新业务；正式边界见[协作边界](database/cross-module-rules.md)及[产品范围](../../../../../../docs/product-scope.md)。

当前工序专检与生产承接见[执行质量边界](database/execution-traceability-quality.md#43-工序专检与生产处理)；独立复检及返工关联模型仍属[未批准设想](../../../../../../docs/roadmap.md#待决策)。

## 需求纠错与收尾的两条入口

日常需求纠错先审批后生效；整批停止先处理真实剩余事项再审批结案。资格、在途更正及齐套影响由[需求更正](database/demand-allocation-and-outbound.md#正式需求更正与替代)与[收尾](database/production-termination.md)分别维护。
