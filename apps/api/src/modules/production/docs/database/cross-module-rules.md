# 跨模块规则、关系与总结

> [返回 Production 数据库设计](README.md)。

## 3.11 跨模块引用说明

本章引用的 `users` 由 [Identity](../../../identity/docs/database.md) 定义，`process_routes`、`process_steps`、`technical_files` 由 [Product](../../../product/docs/database.md) 定义。报工事实使用[生产执行、报工、追溯与质量边界](execution-traceability-quality.md)定义的 `batch_step_reports`；工序异常审批使用 `batch_step_abnormal_dispositions`，不得把异常审批状态写入 `batch_step_records.status`。异常处置、最小返工、工序报废补料及全部补料领用后的路线补产已经落地；`quality_check_order` 和 `quality_check_detail` 仍未定稿，不得提前创建。

跨模块写操作必须由应用服务在同一事务内维护组合外键、快照和操作日志，Controller 不得直接拼接 SQL 修改多张事实表。

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
- 新生产批次分配时，应查 `v_item_batch_available_to_allocate`，不能只查账面库存。

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

---

### 3.12.4 入库明细是业务事实，库存流水是库存事实

| 表                      | 职责                                     |
| ----------------------- | ---------------------------------------- |
| `inbound_detail`        | 记录业务上入库了什么、哪个批次、多少数量 |
| `inventory_transaction` | 记录库存账面如何增加                     |

说明：

- 物料采购入库、半成品入库、成品入库都走 `inbound_order` + `inbound_detail`。
- `inventory_transaction.reference_detail_id` 应指向 `inbound_detail.id`。

---

### 3.12.5 半自动报废补料边界（部分已确认）

已确认补料采用管理员半自动决策：系统只给出候选物料，管理员选择物料并填写数量；系统不得根据工序异常数量或 BOM 自动推算补料数量。补产从路线首工序重新投产，候选物料则只汇总首工序至管理员确认的 `material_end_step_record_id`。编辑和复核阶段先写入不可分配的 `production_scrap_supplement_plan/_line`；最终确认事务才把方案固化为 `production_item_demand`，不再设置与正式需求重复的补料明细表。

补料不得改写原需求事实。工序报废批准后新增需求使用以下字段：

| 字段               | 值          |
| ------------------ | ----------- |
| `demand_type`      | `scrap_supplement` |
| `parent_demand_id` | 原始需求 ID |
| `supplement_id`    | 补料单 ID   |
| `need_number`      | 补料数量    |

说明：

- 不得直接修改原始需求的 `need_number`。
- 目标链路为：异常报工 → 报废事实与补产授权 → 补料单 → 补料需求 → 分配 → 出库齐套 → 授权可执行。
- 补料物料数量不直接形成产品报工额度。批准时已把报废数量固化到 `batch_step_scrap_reproduction_authorization.authorized_quantity`；对应补料单的全部需求完成确认领料后改为 `fulfilled`，该授权才进入路线计算。分配、待出库或部分出库均不可执行。
- 来源工序不能直接增加可报量。首工序先获得新增投入量；各上游工序形成新增正常产出后，额度才通过 `effective_normal` 逐道向下放行。报工校验只读跨表派生结果，不修改库存或需求事实。当前不追踪某次补报逐笔消费哪张补料单；未来如需部分激活、指定来源消费、半成品重入或撤销已激活额度，再评审独立消费/重入事实和并发规则。
- `production_scrap_supplement_plan/_line` 只归 Production 模块所有，草稿不能被仓库分配或出库；`production_material_supplement`、工序报废、补产授权和正式需求之间使用批次、工序、BOM 明细、物料和原始需求组合外键保持一致；只允许 Production 模块在最终批准工序报废补料事务中写入正式来源链路。

#### 3.12.5.1 生产领料损耗补料

生产领料损耗是“已经确认领出的某种物料发生损坏或丢失”，不是产品工序报废。现场按生产批次和已确认领料分配行创建 `item_scrap(scrap_scene = 'production_consumed')`；管理员确认后固定一比一补回同物料、同单位、同损耗数量，不提供不补料或改量选择。

本流程明确采用“生产授权上限与现场物料可用量解耦”：产品授权是数量边界，现场领料是物流事实。领后损耗不会撤销、减少或暂停既有产品授权；系统只追加损耗事实及等量物料补料需求。这样避免引入授权逐笔消费、物料实时绑定、额度回收和历史报工反向重算等超出轻量 MES 当前收益的复杂状态。

| 字段 | 值 |
| --- | --- |
| `production_material_supplement.source_type` | `material_loss` |
| `production_item_demand.demand_type` | `material_loss_supplement` |
| `production_item_demand.parent_demand_id` | 来源链路的原始正常需求 ID |
| `production_item_demand.supplement_id` | 损耗补料单 ID |
| `production_item_demand.need_number` | 已确认 `item_scrap.scrap_number` |

说明：

- 目标链路为：现场申报领料损耗 → 管理员确认 `item_scrap` → 损耗补料单 → 单条损耗补料需求 → 分配 → 确认领料 → 补料单 `fulfilled`。
- 确认 `production_consumed` 损耗时不得再次扣库存；库存已经由原领料出库流水扣减。损耗记录用于物料去向、责任和后续补料追溯。
- 损耗补料不创建 `batch_step_scrap_records` 或 `batch_step_scrap_reproduction_authorization`，不增加 `authorized_quantity`，也不改变任一工序的产品可报上限。现场没有替代物料时由物理条件阻止生产，系统不通过伪造新产品额度表达物料短缺。
- 普通退料不是损耗，不得创建虚假 `production_consumed` 报废记录获得补料。`return_after_outbound` 退料后报废仍保持未开放。
- Production 模块只允许在管理员确认生产领料损耗的同一事务中写入 `item_scrap` 终态、`production_material_supplement(source_type = 'material_loss')`、单条 `material_loss_supplement` 需求、批次 `material_plan_version/version`、成功审计和幂等结果。需求新增及批次版本推进必须由事务内需求计划写入器共同完成。

#### 3.12.5.2 短批开工不形成物料产能授权

本项目当前不建设生产现场物料事务、工序现场余额、报工自动耗料和按物料计算的报工硬上限。短批开工功能实施时必须遵守以下架构前提，后续需求和设计评审也不得忽略：

- 扣除已确认退料后仍存在大于零的净生产领料、但活动需求尚未全部满足时，只有具备独立权限的管理人员显式复核缺料清单、填写原因并授权，批次才能从 `material_partially_outbound` 开工；仅曾经出库但已经全部退回不能作为开工依据；
- 短批开工授权表示“允许承担当前缺料风险开始生产”，不表示系统已经计算或授予精确的物料可生产数量；
- 产品报工仍只受工序流转数量、有效正常产出、补产授权和异常规则约束，不得根据部分领料量臆造物料报工上限；
- 即使计划生产 `100`、当前物料只足以支持现场生产约 `60`，授权开工后系统仍可能允许产品流转额度内报工至 `100`；系统必须持续展示缺料，但物料充分性由授权人员和现场管理负责；
- 批次开工后允许继续分配、制单和确认领用剩余活动需求；全部领齐只改变物料齐套展示，不得把 `doing` 状态回退为 `material_outbound`；
- 短批授权只允许提前开工，不豁免剩余需求。批次进入 `doing` 后，正常 `active` 需求必须持续进入仓库待分配/待出库查询；只要仍有活动需求，生产执行不得确认完工；
- 如果业务未来要求“无足够已领物料就绝对不能报工”，必须另立现场物料核算项目，补充定量工序 BOM、现场事务/余额、自动耗料、冲销恢复和并发规则；不得直接用需求、分配或出库汇总近似替代现场事实。

短批授权必须绑定当时的物料计划版本。版本字段只保存在 `production_batches.material_plan_version`，`production_item_demand` 不增加需求版本字段，也不按“最新版本”筛选需求；每条需求仍由 `business_status = active/fulfilled/cancelled` 和 `remaining_number` 决定是否执行。创建或取消需求、开工前确认退料并释放回公共库存时在同一事务递增批次版本；`production_short_batch_authorization.material_plan_version` 保存授权所见版本，`production_short_batch_authorization_detail` 逐需求保存需求量、已确认出库、预计出库和允许缺口快照。开工事务要求授权版本等于批次版本、净领用量仍大于零，且当前每条活动需求缺口不超过批准值。确认出库只会改善缺口，因此不递增该版本。该机制不拆分需求，也不允许修改既有 `need_number`；需求更正仍使用“取消旧需求并创建新需求”。

生产执行完工检查必须把活动需求作为阻断项。现场确认剩余需求确实不再需要时，只能由独立权限动作显式关闭：先释放未确认分配/出库占用，再保存需求取消来源、原因、操作人和时间并递增 `material_plan_version`。不得因为批次开始报工或达到计划产量而自动取消需求。

---

### 3.12.6 退料是否释放库存要明确

退料后有两种处理：

| 场景             | 字段设置                   | 含义                         |
| ---------------- | -------------------------- | ---------------------------- |
| 仍属于原生产批次 | `release_after_return = 0` | 原生产批次后续可再次领用     |
| 释放给公共库存   | `release_after_return = 1` | 新生产批次可以分配这部分库存 |

说明：

- 如果生产已经结束，多领退料通常建议释放给公共库存。
- 如果只是临时退回，后续还可能继续领用，则不释放。

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

### 3.12.8 产品与工艺路线归属校验

路线与产品归属由应用事务校验，数据库不增加复杂组合外键。

- Product 只维护一份 BOM。Production 创建首个生产任务时必须通过 Product 公开写边界锁定该 BOM，不得直接访问或更新 Product 表。
- BOM 锁定和任务创建必须共享同一数据库事务：成功时同时提交，任务创建失败时锁定事实同时回滚。历史是否存在生产任务不得由 Product 跨模块查询临时推导。
- 锁定事实由 Product 所有的 `products.bom_locked_at/bom_locked_by` 持久化；任务取消、需求完成或库存变化均不得解除锁定。
- 设置产品默认路线时，应用必须校验路线的 `product_id` 等于当前产品 ID，且路线状态为 `enabled`。
- 创建生产批次时，以工单产品为准；未指定路线时读取产品默认路线，指定路线时允许使用同产品的非默认路线。
- 生产批次不得使用其他产品的路线或未启用路线。
- 批次工序必须由后端查询所选路线的有效 `process_route_steps` 后按顺序自动生成，不接受前端提交任意 `route_step_id` 集合。
- 上述读取、校验、批次创建和批次工序生成必须处于同一应用事务。

### 3.12.9 需求幂等与报废补料候选条件

- 正常需求幂等键为 `NORMAL:{production_batch_id}:{product_material_id}`。
- 工序报废补料需求幂等键为 `SCRAPSUP:{supplement_id}:{parent_demand_id}`。
- 人工追加候选内部键为 `ADDITIONAL:{production_batch_id}:{business_action_no}:{product_material_id}`。
- 相同幂等键重复提交返回既有需求，不新增记录、不修改原需求数量。
- 一条已确认报废可以为不同 BOM 行生成多条补料需求，但报废、原需求和补料需求必须属于同一生产批次。

### 3.12.10 库存分配并发行锁

库存正确性使用 `item_batch` 行锁保证，Redis 不作为必要条件或库存事实来源。

分配事务必须按以下顺序执行：

1. 锁定目标 `item_batch` 行；多批次操作按稳定的批次 ID 升序加锁，避免死锁。
2. 在锁内从 `inventory_transaction` 重新汇总账面可用库存。
3. 在锁内汇总有效、未释放、未取消的生产分配占用。
4. 计算最新可分配数量并校验本次分配。
5. 写入 `production_item_allocation`。
6. 更新必要的业务状态并写操作日志。
7. 提交事务后再向调用方返回成功。

单库存批次的行锁查询：

```sql
SELECT id FROM item_batch WHERE id = :batch_id FOR UPDATE;
```

出库、退料、库存侧报废和盘点确认涉及同一库存批次时，也必须遵循相同批次锁顺序。

### 3.12.11 批次完工确认与乐观锁

`production_batches` 的完工确认使用 `version` 乐观锁。当前生产过程采用临时自检放行口径；批次完工只表达生产执行完成，不代表最终质量结论：

- 批次完工前校验所有 `need_record_snapshot = 1` 的工序已完成。
- `need_inspection_snapshot` 当前只保留路线快照，不创建过程检验任务，也不作为批次生产完工或下工序流转的阻塞条件；这是过程质量流程缺失期间的临时方案。
- 最小 `rework_records` 已落地；返工完成报工计入工序有效正常/异常数量，未完成返工和待处理异常继续由各自业务记录独立表达和展示，不复用批次执行状态。批次生产执行完工按权威报工章节校验必报工工序与末道有效正常量，不伪造尚未定稿的最终质量结论。
- `completed_quantity` 固定取最后一道必报工工序（`need_record_snapshot = 1` 且 `step_order_snapshot` 最大）的 `effective_normal`。完工命令必须在事务内锁定并校验全部必报工工序、重新聚合该数量，客户端不得提交完成数量；没有必报工工序或任一必报工工序未完成时拒绝。
- 当前不支持正常数量不足时的短批完工；未来必须以独立的生产损失/短批完工事实确认差额，不得人工覆盖 `completed_quantity`。正常批次完工必须在同一事务写入完成数量、完工时间、完工人、`completed` 状态和成功操作日志。
- 批次完工不自动创建入库单、库存批次或库存流水。
- `batch_step_reports.normal_quantity` 是工序自检正常量，不是最终质检合格量；不得直接写入 `production_batches.qualified_quantity`。
- 生产完成后的最终质检、`qualified_quantity` 写入和工单合格完成数量汇总仍待质量模型定稿；在此之前不得把批次生产完工描述为最终质量完成。

### 3.12.12 库存状态转换双流水

本节是库存与未来质量放行的接口边界，不是当前可实施流程。质量放行事实定稿后，库存状态通过同事务内的双流水表达，不创建独立状态转换单据：

- 待检 → 可用：一条 `stock_status = pending_inspection` 的负数流水 + 一条 `stock_status = available` 的正数流水。
- 两条流水共享相同 `transaction_group_key`，使用不同且分别唯一的 `idempotency_key`。
- 两条流水具有相同 `item_id`、`batch_id`、单位和数量绝对值。
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

## 3.13 最终表关系简图

```text
product_categories
  ↓
products
  ↓
product_materials

work_orders
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

- 物料、半成品、成品统一库存模型。
- 生产批次和库存批次语义清晰，不互相混用。
- 可支持半成品入库、成品入库、外购入库、委外入库。
- 可支持生产领料、退料、报废补料、盘点调整。
- 主表不保存可随意覆盖的累计缓存字段，减少数据不一致风险。
- 库存大流水查询已使用与流水同事务维护、可重建对账的批次级和物料级余额投影；需求使用同事务维护的剩余数量投影。投影不得替代事实表或获得独立业务写入口。
