# 跨模块规则、关系与总结

> [返回 Production 数据库设计](README.md)。

## 3.11 跨模块引用说明

本章引用的 `users` 由 [Identity](../../../identity/docs/database.md) 定义，`process_routes`、`process_steps`、`technical_files` 由 [Product](../../../product/docs/database.md) 定义。物料精确版本只通过 Product 的 `MaterialVariantQuery` 公开能力读取，Production 不得直接查询 `material_variants`。报工事实使用[生产执行、报工、追溯与质量边界](execution-traceability-quality.md)定义的 `batch_step_reports`；工序异常审批使用 `batch_step_abnormal_dispositions`，不得把异常审批状态写入 `batch_step_records.status`。异常处置、最小返工、工序报废补料及全部补料领用后的路线补产已经落地；`quality_check_order` 和 `quality_check_detail` 仍未定稿，不得提前创建。

跨模块写操作必须由应用服务通过所属模块公开能力在同一事务内维护组合外键、快照和操作日志；不得直接修改其他模块表，Controller 不写 SQL。

展示查询采用根架构的正式读取登记：Production 的 `infrastructure/queries/` 获准读取 `materials.id/material_name` 及登记的 Inventory 批次、余额、流水和入库展示字段，具体字段以 `scripts/api-data-ownership.mjs` 为准。查询用于名称展示、搜索、排序、候选及追溯，不得写表、加锁或代替公开资格校验。历史名称不过滤停用或软删除状态；未开放直接读取 `products`、`material_variants` 等其他表。

物料版本候选和历史展示使用不同公开能力：候选用 `MaterialVariantQuery.listEnabledByMaterials`；生产分配、领料制单与确认在事务内通过 `ProductInventoryEligibility.requireProductionIssuableReferences` 锁定并校验用途资格。补料方案历史编码用 `listDisplayReferencesByIds` 按既有版本 ID 解析，包括停用或软删除版本。
历史展示引用只有 ID 与编码，不能重新作为可选版本或写入资格依据。

---

## 3.12 关键业务规则汇总

### 3.12.1 生产批次和库存批次必须分离

| 类型     | 表                   | 含义                   |
| -------- | -------------------- | ---------------------- |
| 生产批次 | `production_batches` | 这一批怎么生产         |
| 库存批次 | `item_batch`         | 入库后怎么存、怎么追溯 |

说明：

- `production_batches.id` 不应直接作为库存流水的 `batch_id`。
- 库存流水的 `batch_id` 应统一指向 `item_batch.id`。
- `item_batch.source_production_batch_id` 用来追溯库存批次来源于哪个生产批次。

---

### 3.12.2 分配等于预留

创建 `production_item_allocation` 后，分配数量应视为被该生产批次占用。

可分配库存计算：

```text
可分配数量 = 账面可用库存 - 已预留未释放数量
```

说明：

- 分配不会生成库存流水。
- 出库才会生成库存流水。
- 新生产批次分配时，使用 Production 的可分配库存查询，并在写事务锁内复核数量与精确物料版本；计算口径见[库存查询与可分配量](inventory-ledger-and-inbound.md#75-库存查询与可分配量)。账面可用库存须扣除有效分配的未出库占用。

---

### 3.12.3 出库明细是业务事实，库存流水是库存事实

| 表                      | 职责                                         |
| ----------------------- | -------------------------------------------- |
| `outbound_detail`       | 记录业务上出了什么、从哪个分配行出、出了多少 |
| `inventory_transaction` | 记录库存账面如何变化                         |

说明：

- `inventory_transaction.reference_detail_id` 应指向 `outbound_detail.id`。
- 一张 `outbound_order` 可以有多条 `outbound_detail`。
- `outbound_order.production_batch_id` 表示本次出库服务哪个生产批次。
- `outbound_detail` 同时保存 `item_id` 与 `material_variant_id`，并由 demand/allocation/batch 组合外键阻止跨版本出库。

---

### 3.12.4 入库明细是业务事实，库存流水是库存事实

| 表                      | 职责                                     |
| ----------------------- | ---------------------------------------- |
| `inbound_detail`        | 记录业务上入库了什么、哪个批次、多少数量 |
| `inventory_transaction` | 记录库存账面如何增加                     |

说明：

- 当前正式范围支持 `source_type = purchased` 的外购物料入库，以及按当前有效批准清单办理的 `self_made` 生产流转成品入库与 `production_extra` 额外产出成品入库，共用 `inbound_order` + `inbound_detail` 和同一库存流水账本。成品按任务、类别收齐后一次确认，使用独立 `product_id` 身份；具体规则见[成品入库](finished-goods-inbound.md)。其他自产半成品、委外及通用其他入库仍未开放。
- `inventory_transaction.reference_detail_id` 应指向 `inbound_detail.id`。
- 外购写入统一由 Procurement 核验到货及 Quality 放行后调用 Inventory，允许停用精确版本按 ADR-0013 办理；旧手工创建、确认和取消写路由已移除。入库明细、库存批次和流水必须保存同一 `material_variant_id`。

---

### 3.12.5 半自动报废补料边界（部分已确认）

补料版本选择统一遵守[工单物料版本规则](work-orders-and-batches.md)：批量单复用整个工单已锁定版本，研发单允许重新选择同一基础物料下的启用版本。

已确认补料采用管理员半自动决策：系统只给出当前批次完整 BOM 基础下的启用版本候选，管理员按基础行明确选择精确 `material_variant_id` 并填写数量；系统不得根据工序异常数量或 BOM 自动推算补料数量，也不再选择物料截止工序。补产从路线首工序重新投产。编辑和复核阶段先写入不可分配的 `production_scrap_supplement_plan/_line`；最终确认事务才把方案固化为 `production_item_demand`，不再设置与正式需求重复的补料明细表。

补料不得改写原需求事实。工序报废批准后新增需求使用以下字段：

| 字段               | 值          |
| ------------------ | ----------- |
| `demand_type`      | `scrap_supplement` |
| `parent_demand_id` | 原始需求 ID |
| `supplement_id`    | 补料单 ID   |
| `requirement_basis_id` | 批次冻结的 BOM 基础 ID |
| `material_variant_id` | 管理员选择的精确物料版本 ID |
| `need_number`      | 补料数量    |

说明：

- 不得直接修改原始需求的 `need_number`。
- 目标链路为：异常报工 → 报废事实与补产授权 → 补料单 → 补料需求 → 分配 → 出库齐套 → 授权可执行。
- 补料物料数量不直接形成产品报工额度。批准时已把报废数量固化到 `batch_step_scrap_reproduction_authorization.authorized_quantity`；对应补料单的全部当前有效要求经领料或已生效更正满足后改为 `fulfilled`，该授权才进入路线计算。分配、待出库或部分出库均不可执行。
- 来源工序不能直接增加可报量。首工序先获得新增投入量；各上游工序形成新增正常产出后，额度才通过 `effective_normal` 逐道向下放行。报工校验只读跨表派生结果，不修改库存或需求事实。当前不追踪某次补报逐笔消费哪张补料单；未来如需部分激活、指定来源消费、半成品重入或撤销已激活额度，再评审独立消费/重入事实和并发规则。
- `production_scrap_supplement_plan/_line` 只归 Production 模块所有，草稿不能被仓库分配或出库；`production_material_supplement`、工序报废、补产授权和正式需求之间使用批次、BOM 基础、BOM 明细、基础物料、精确物料版本和原始需求组合外键保持一致；只允许 Production 模块在最终批准工序报废补料事务中写入正式来源链路。

#### 3.12.5.1 生产领料损耗补料

生产领料损耗是“已经确认领出的某种物料发生损坏或丢失”，不是产品工序报废。现场按生产批次和已确认领料分配行创建 `item_scrap(scrap_scene = 'production_consumed')`；管理员确认后固定一比一补回同物料、同单位、同损耗数量，不提供不补料或改量选择。

本流程明确采用“生产授权上限与现场物料可用量解耦”：产品授权是数量边界，现场领料是物流事实。领后损耗不会撤销、减少或暂停既有产品授权；系统只追加损耗事实及等量物料补料需求。这样避免引入授权逐笔消费、物料实时绑定、额度回收和历史报工反向重算等超出轻量 MES 当前收益的复杂状态。

| 字段 | 值 |
| --- | --- |
| `production_material_supplement.source_type` | `material_loss` |
| `production_item_demand.demand_type` | `material_loss_supplement` |
| `production_item_demand.parent_demand_id` | 来源链路的原始正常需求 ID |
| `production_item_demand.supplement_id` | 损耗补料单 ID |
| `production_item_demand.material_variant_id` | 来源分配行锁定的精确物料版本 ID |
| `production_item_demand.need_number` | 已确认 `item_scrap.scrap_number` |

说明：

- 目标链路为：现场申报领料损耗 → 管理员确认 `item_scrap` → 损耗补料单 → 单条损耗补料需求 → 分配 → 确认领料 → 补料单 `fulfilled`。
- 确认 `production_consumed` 损耗时不得再次扣库存；库存已经由原领料出库流水扣减。损耗记录用于物料去向、责任和后续补料追溯。
- 损耗补料不创建 `batch_step_scrap_records` 或 `batch_step_scrap_reproduction_authorization`，不增加 `authorized_quantity`，也不改变任一工序的产品可报上限；需求仍锁定来源分配的精确物料版本。现场没有替代物料时由物理条件阻止生产，系统不通过伪造新产品额度表达物料短缺。
- 普通退料不是损耗，不得创建虚假 `production_consumed` 报废记录获得补料。`return_after_outbound` 退料后报废仍保持未开放。
- Production 模块只允许在管理员确认生产领料损耗的同一事务中写入 `item_scrap` 终态、`production_material_supplement(source_type = 'material_loss')`、单条 `material_loss_supplement` 需求、批次 `material_plan_version/version`、成功审计和幂等结果。需求新增及批次版本推进必须由事务内需求计划写入器共同完成。

#### 3.12.5.2 短批开工不形成物料产能授权

本项目当前不建设生产现场物料事务、工序现场余额、报工自动耗料和按物料计算的报工硬上限。短批开工功能实施时必须遵守以下架构前提，后续需求和设计评审也不得忽略：

- 已发生确认领料、但活动需求尚未全部满足时，只有具备独立权限的管理人员显式复核缺料清单、填写原因并授权，批次才能从 `material_partially_outbound` 开工；退料完全不参与短批开工判断，已确认领料即使全部退回也不因此阻止开工；
- 短批开工授权表示“允许承担当前缺料风险开始生产”，不表示系统已经计算或授予精确的物料可生产数量；
- 产品报工仍只受工序流转数量、有效正常产出、补产授权和异常规则约束，不得根据部分领料量臆造物料报工上限；
- 即使计划生产 `100`、当前物料只足以支持现场生产约 `60`，授权开工后系统仍可能允许产品流转额度内报工至 `100`；系统必须持续展示缺料，但物料充分性由授权人员和现场管理负责；
- 批次开工后允许继续分配、制单和确认领用剩余活动需求；全部领齐只改变物料齐套展示，不得把 `doing` 状态回退为 `material_outbound`；
- 短批授权只允许提前开工，不豁免剩余需求。批次进入 `doing` 后，正常 `active` 需求必须持续进入仓库待分配/待出库查询；只要仍有活动需求，生产执行不得确认完工；
- 如果业务未来要求“无足够已领物料就绝对不能报工”，必须另立现场物料核算项目，补充定量工序 BOM、现场事务/余额、自动耗料、冲销恢复和并发规则；不得直接用需求、分配或出库汇总近似替代现场事实。

短批授权必须绑定当时的物料计划版本。版本字段只保存在 `production_batches.material_plan_version`，`production_item_demand` 不增加需求版本字段，也不按“最新版本”筛选需求；每条需求由业务状态、`remaining_number` 和 `pending_correction_id` 决定可操作性；审批中仍为 active 并保留缺口。创建或取消需求时在同一事务递增批次物料计划版本；退料不改变需求计划和授权，也不参与授权预览、开工投影或开工事务；`production_short_batch_authorization.material_plan_version` 保存授权所见版本，`production_short_batch_authorization_detail` 逐需求保存需求量、已确认出库、预计出库和允许缺口快照。开工事务要求授权版本等于批次版本、已发生确认领料（不扣退料），且当前每条活动需求缺口不超过批准值。确认出库只会改善缺口，因此不递增该版本。该机制不拆分需求，也不允许修改既有 `need_number`；需求更正使用“审批后关闭旧剩余并创建替代需求”。

生产执行完工检查必须把活动需求作为阻断项。个别需求错误通过需求更正审批关闭／替代；整批停止生产通过逐项收尾与结案审批。关闭保存独立原因、操作人、时间和更正／收尾依据，由 Writer 推进 `material_plan_version`，不以 cancelled 伪装。不得因为批次开始报工或达到计划产量而自动取消需求。

---

### 3.12.6 退料只负责余料回仓

退料仅用于现场多余物料或订单中途关闭后的余料退回原库存批次，固定 `release_after_return = 1`、`return_stock_status = available`，成为公共可用库存。没有保留给原任务或临时退库的分支。

退料 Repository 只写生产退料单和成功审计，并在同事务通过 Inventory 公开能力追加回仓流水；不得调用需求计划 Writer，不改变需求余额、分配履约、批次状态、物料计划版本或短批授权。查询层也不得通过扣除退料量伪造新的待分配/待领料缺口。损耗确认才生成等量损耗补料需求；人工追加需求由独立配置入口明确产生。执行模块负责独立开工和完工门禁，订单关闭及剩余需求关闭不由退料代办。

各窄端口的允许写入与禁止事项见[退料、损耗与盘点的职责表](return-scrap-and-stocktake.md#业务语义与写入职责)。修改退料、损耗、需求、分配、库存查询或生产执行时必须一起核对该边界，不得在各自模块恢复另一套语义。

---

### 3.12.7 盘点调整必须生成库存流水

盘点明细记录账面数量和实盘数量。
若存在差异，应生成 `inventory_transaction`：

| 差异 | 库存流水                      |
| ---- | ----------------------------- |
| 盘盈 | `stock_check_adjustment` 正数 |
| 盘亏 | `stock_check_adjustment` 负数 |

说明：

- 盘点不应直接修改库存余额。
- 盘点调整应通过库存流水体现。
- `stock_check_detail.adjusted` 用于标记是否已经生成调整流水，防止重复调整。

---

### 3.12.8 产品默认路线与执行快照校验

路线不归属产品；只由产品默认路线提供快捷填单值，不建立产品—路线适用关系表。

- Product 只维护一份 BOM。Production 创建任何生产任务时必须通过 Product 公开能力校验 BOM 已批准并锁定，不得直接访问或更新 Product 表。
- BOM 批准及永久锁定由 Approval 与 Product 同事务完成；任务创建在自身事务中锁定读取批准事实和当前物料资格，不再写首次 BOM 锁定。任务失败不撤销已经成立的审批事实。
- 锁定事实由 Product 所有的 `products.bom_locked_at/bom_locked_by` 持久化；任务取消、需求完成或库存变化均不得解除锁定。
- 设置产品默认路线时，应用必须校验路线状态为 `enabled` 且未删除。
- 创建生产批次时，以工单产品为准；未指定路线时读取产品默认路线，指定路线时允许使用其他已启用路线。
- 生产批次不得使用未启用或已删除路线；允许不同成品共用一条路线。
- 批次工序必须由后端查询所选路线的有效 `process_route_steps` 后按顺序自动生成，不接受前端提交任意 `route_step_id` 集合。
- 路线只描述工序顺序和执行快照，不绑定 `product_materials`；生产物料需求只能从批次冻结的完整 BOM 基础按行确认，不得恢复 route-step BOM 语义。
- 上述读取、校验、批次创建和批次工序生成必须处于同一应用事务。

### 3.12.9 需求幂等与报废补料候选条件

- 正常需求幂等键为 `NORMAL:{production_batch_id}:{requirement_basis_id}:{material_variant_id}`。
- 工序报废补料需求幂等键为 `SCRAPSUP:{supplement_id}:{parent_demand_id}`。
- 人工追加候选内部键为 `ADDITIONAL:{production_batch_id}:{business_action_no}:{product_material_id}`。
- 相同幂等键重复提交返回既有需求，不新增记录、不修改原需求数量。
- 正常需求配置、人工追加、补料、采购入库等新增写入均必须通过 `IdempotencyExecutor`；写事务内重新读取并锁定批次、BOM 基础和 Product 公共启用版本，不能依赖事务外预检。
- 需求管理查询必须返回全部需求类型及取消、关闭和替代历史；具体需求行提供人工追加入口，历史停用版本使用需求快照展示。
- 一条已确认报废可以为不同 BOM 行生成多条补料需求，但报废、原需求和补料需求必须属于同一生产批次。

### 3.12.10 库存分配并发行锁

库存正确性使用 `item_batch` 行锁保证，Redis 不作为必要条件或库存事实来源。

分配事务必须按以下顺序执行：

1. 锁定生产根后，通过 Product 公开用途能力按稳定身份顺序校验，再调用 `InventoryStockCommand.lockMaterialBatches`；Inventory 先取得 Product 历史身份共享锁，再按批次 ID 升序锁定 `item_batch`，批次状态取该锁内当前值。
2. Inventory 在批次锁内对流水维护的 `inventory_batch_balance` 做当前读，缺行按零计算，不使用事务早期快照；流水仍是唯一库存事实。
3. Production 对有效分配与已完成出库明细做当前读后汇总预留，不能用普通聚合子查询读取事务早期快照。跨任务并发命令发生死锁时按现有事务幂等重试处理。
4. 校验 demand、allocation、item_batch 的 `material_variant_id` 完全一致；分配只履约既有需求选择，不在此处重新选择或回落默认版本。
5. 计算最新可分配数量并校验本次分配。
6. 写入 `production_item_allocation`。
7. 更新必要的业务状态并写操作日志。
8. 提交事务后再向调用方返回成功。

以下批次锁查询由 Inventory 执行，Production 不直接访问其锁入口：

```sql
SELECT id FROM item_batch WHERE id = :batch_id FOR UPDATE;
```

出库、退料、库存侧报废和盘点确认涉及同一库存批次时，也必须遵循相同批次锁顺序。

### 3.12.11 批次完工确认与乐观锁

`production_batches` 的执行完工确认使用 `version` 乐观锁。当前生产过程采用临时自检放行口径；执行完成后先进入结案，不代表已批准产出：

- 批次完工前校验所有工序已完成。
- `need_inspection_snapshot` 当前只保留路线快照，不创建过程检验任务，也不作为批次生产完工或下工序流转的阻塞条件；这是过程质量流程缺失期间的临时方案。
- 最小 `rework_records` 已落地；返工完成报工计入工序有效正常/异常数量，未完成返工和待处理异常继续由各自业务记录独立表达和展示，不复用批次执行状态。批次生产执行完工按权威报工章节校验工序与末道有效正常量，不伪造尚未定稿的最终质量结论。
- `lastStepReportedQuantity` 固定从最后一道工序（`step_order_snapshot` 最大）的报工事实派生 `effective_normal`，含进行中任务已有报工，不在批次表另存数量。执行完工命令在事务内锁定并校验全部工序、物料履约和末道有效正常量，客户端不得提交或覆盖报工汇总；没有工序或任一工序未完成时拒绝。
- 正常执行完工仍须报工达标，同事务记录 `execution_completed_at/by`、进入 `closing`、创建 normal 结案草稿并写成功操作日志。提前停止使用 early closing；两种模式均通过质检留存、管理员核对和负责人审批确认实际产出，批准后分别进入 `completed/terminated`。实际可用量不足计划可据实批准，不反向放宽工序报工规则。
- 批次完工不自动创建入库单、库存批次或库存流水。
- `batch_step_reports.normal_quantity` 是工序自检正常量，不是最终质检合格量。工序查询使用 `normalQuantity`，页面不能标为质检通过。
- 质检留存于独立不可变记录；任务审定产出与工单汇总仅取当前有效批准清单，批次表不另存合格量。完整在线 Quality 仍未接入，不把生产执行完成描述为质量放行或已入库。

### 3.12.12 库存状态转换双流水

本节是库存与未来质量放行的接口边界，不是当前可实施流程。质量放行事实定稿后，库存状态通过同事务内的双流水表达，不创建独立状态转换单据：

- 待检 → 可用：一条 `stock_status = pending_inspection` 的负数流水 + 一条 `stock_status = available` 的正数流水。
- 两条流水共享相同 `transaction_group_key`，使用不同且分别唯一的 `idempotency_key`。
- 两条流水具有相同 `item_id`、`material_variant_id`、`batch_id`、单位和数量绝对值。
- `reference_type` 和 `reference_detail_id` 必须指向未来定稿的质量放行事实；当前不得预设为尚不存在的 `inspection_records`。
- 状态转换流水必须填写 `transaction_group_key`；该字段建立普通索引用于成对核查，两条流水仍分别依靠 `idempotency_key` 防止重复。
- 质量结论、检验人员和报告只保存在未来的质量模型，库存流水只记录数量和状态维度。

### 3.12.13 多态库存流水引用规则

`inventory_transaction.reference_type + reference_detail_id` 是多态引用，数据库普通外键无法表达：

- 应用必须根据 `reference_type` 校验 `reference_detail_id` 指向的记录存在且类型匹配。
- 校验来源记录与库存流水的 `item_id`、`batch_id`、单位、数量方向和业务状态一致。
- 业务明细、库存流水和操作日志必须在同一事务写入。
- 每条库存流水必须具有唯一 `idempotency_key`。
- 已确认库存流水不可更新或删除，错误只能通过数量相反、库存状态相同的冲销流水修正。
- 冲销流水必须填写 `reversal_of_transaction_id` 并保留原业务引用；一期只支持一次整笔全额冲销，不关联任何财务报销 ID。

### 3.12.14 需求纠错及收尾审批边界

Production 所有 `production_demand_correction`、`production_batch_closeout`、`production_batch_closeout_action`、`production_output_inspection`、`production_output_revision`，Approval 所有流程、实例、节点和决定；通过公开 handler 协作，不跨模块改表。需求、库存仍只有原事实表，没有影子表。

更正最终批准与出库确认调用同一个有效补料需求判定：真实 fulfilled、生效替代链或已批准且已领满足的剩余免除才可齐套，普通关闭和整单零领料不能放行。原补料单与授权保留，路线公式只读取单据履约结果。正常完成还检查活动需求（包括审批中）和未齐套补料单。

新更正／收尾命令及末级 handler 先锁工单、批次，再锁申请、需求、物流和工序等受影响事实；只读定位不作为写入资格。审批先调用业务 handler 锁根和校验绑定，再锁实例与当前节点；所有当前数量和证据使用当前读，失败整事务回滚。新需求和旧关闭在同一事务内可见，只推进一次批次／计划版本。

在途更正冻结仅该旧需求的分配、释放、出库和再次更正；需求仍参与短缺与完工检查。批次取消／收尾不能越过在审指针。进入 closing 后禁止普通执行及新增需求，管理员逐项处理后送审；驳回保留真实处理结果，末级批准追加不可变产出清单并推进当前版本，normal/early 分别正常结案或提前结束；不再写旧终止事实表。质检只保存独立不可变记录，管理员核定三项数量后送审，质检不改草稿。初次结案的领退料、损耗或路线影响改变审批依据时须撤回／驳回并重核；批准后的清单更正继承原收尾证据，只复核当前批准版、检验、申报和收货事实，不能替换历史证据或重开执行。

字段、冻结规则和端点见[需求](demand-allocation-and-outbound.md#正式需求更正与替代)与[收尾](production-termination.md)。

## 3.13 最终表关系简图

```text
item_categories
  ↓
products（成品）
  ↓
product_materials → materials（基础物料）→ material_variants
  ↓（批次配置时冻结）
production_material_requirement_basis
  ↓（管理员整单选择精确版本）
production_item_demand
  ↓
material_variants

work_orders → work_order_material_versions（仅批量单的版本选择）
  ↓
production_batches
  ↓
production_item_demand
  ↓
production_item_allocation
  ↓
outbound_order
  ↓
outbound_detail
  ↓
inventory_transaction

production_batches
  ↓
inbound_order
  ↓
inbound_detail
  ↓
item_batch
  ↓
inventory_transaction

production_item_allocation
  ↓
return_order
  ↓
return_detail
  ↓（`return_after_outbound`）
item_scrap
  ↓
inventory_transaction

production_item_allocation
  ↓（已确认生产领料发生损耗）
item_scrap(production_consumed)
  ↓
production_material_supplement(material_loss)
  ↓
production_item_demand(material_loss_supplement)

stock_check_order
  ↓
stock_check_detail
  ↓
inventory_transaction
```

---

## 3.14 方案总结

本方案的核心是：

```text
生产批次管生产执行。
库存批次管库存追溯。
库存流水管数量变化。
分配明细管预留占用。
出入库明细管业务动作。
视图负责汇总结果。
```

主要优点：

- 基础物料与精确版本分层，需求和物流事实沿组合外键保持版本一致。
- 物料、成品统一库存模型；半成品不再是独立产品类型。
- 生产批次和库存批次语义清晰，不互相混用。
- 当前正式范围支持 `purchased` 外购物料入库，以及按批准清单办理的 `self_made`／`production_extra` 两类成品入库；半成品不是独立产品类型，其他自产半成品、委外及通用其他入库仍留待后续范围评审。
- 可支持生产领料、退料、报废补料、盘点调整。
- 主表不保存可随意覆盖的累计缓存字段，减少数据不一致风险。
- 库存大流水查询已使用与流水同事务维护、可重建对账的批次级和物料级余额投影；需求使用同事务维护的剩余数量投影。投影不得替代事实表或获得独立业务写入口。
