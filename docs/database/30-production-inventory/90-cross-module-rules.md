# 跨模块规则、关系与总结

> [返回生产与库存总览](README.md) · [返回数据库设计总览](../README.md)。本章是生产与库存规范的组成部分，不是独立副本。

## 3.11 跨模块引用说明

本章引用的 `users`、`process_routes`、`process_steps`、`technical_files` 分别由[系统、RBAC 与认证](../10-system-rbac-auth.md)和[文件与工艺](../20-files-and-process.md)定义。报工事实使用[生产报工、追溯与质量边界](../40-production-traceability-quality.md)定义的 `batch_step_reports`；工序异常使用已追加 migration 的 `batch_step_abnormal_dispositions`，不得把异常处置状态写入 `batch_step_records.status`。异常报工会创建待处置单，但审批命令及下游事务尚未实现；当前阶段明确不做返工/补料报工额度来源和激活限制；`rework_records`、工序报废、`quality_check_order` 和 `quality_check_detail` 仍未定稿，不得提前创建。

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

已确认补料采用管理员半自动决策：系统只给出候选物料，管理员选择物料并填写数量；系统不得根据工序异常数量或 BOM 自动推算补料数量。候选物料优先取异常工序绑定的有效 `route_step_materials`，未绑定时可以降级为当前产品全部有效 BOM 物料。最终选中的物料、人工填写数量、单位和原始需求在补料明细中冻结，未选候选项不需要冻结。

补料不得改写原需求事实。对于现有 `item_scrap` 表达的库存或生产消耗报废，批准后新增需求使用以下字段：

| 字段               | 值          |
| ------------------ | ----------- |
| `demand_type`      | `scrap_supplement` |
| `parent_demand_id` | 原始需求 ID |
| `source_scrap_id`  | 报废记录 ID |
| `need_number`      | 补料数量    |

说明：

- 不得直接修改原始需求的 `need_number`。
- 目标链路为：原始需求 → 工序报废/补料单及明细 → 补料需求 → 分配 → 出库。
- 上表的 `source_scrap_id` 只允许引用现有 `item_scrap.id`。未来工序报废补料不得把 `batch_step_scrap_records.id` 填入该字段；它与补料明细、需求之间的新来源外键需要另行定稿。
- 当前阶段补料、分配和出库不形成再次报工额度，也不作为报工开关；工序只按有效正常数量是否达到当前要求数量判断能否继续报工。
- 该简化方案无法追溯某次补报所使用的补料/返工来源，也不能控制来源剩余额度。未来如升级严格控制，再评审来源授权、出库激活、消费明细和并发规则。
- `production_material_supplement`、补料明细、工序报废和需求之间的完整外键仍待决策；未闭环前不得据此创建表或接口。

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

- 设置产品默认路线时，应用必须校验路线的 `product_id` 等于当前产品 ID，且路线状态为 `enabled`。
- 创建生产批次时，以工单产品为准；未指定路线时读取产品默认路线，指定路线时允许使用同产品的非默认路线。
- 生产批次不得使用其他产品的路线或未启用路线。
- 批次工序必须由后端查询所选路线的有效 `process_route_steps` 后按顺序自动生成，不接受前端提交任意 `route_step_id` 集合。
- 上述读取、校验、批次创建和批次工序生成必须处于同一应用事务。

### 3.12.9 需求幂等与报废补料候选条件

- 正常需求幂等键为 `NORMAL:{production_batch_id}:{product_material_id}`。
- 当前库存/生产消耗报废补料候选内部键为 `SCRAP:{source_scrap_id}:{product_material_id}`；未来工序补料单的幂等来源键随补料明细外键一并定稿，不得复用不匹配的 `item_scrap` ID。
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
- 当前尚无 `rework_records`，生产执行完工不得伪造“无未关闭返工”校验；待处理异常继续由 `batch_step_abnormal_dispositions` 独立表达和展示，不复用批次执行状态。
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

production_item_demand
  ↓
item_scrap
  ↓
production_item_demand 报废补料

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
- 主表不保存累计缓存字段，减少数据不一致风险。
- 后续如性能不足，可在视图基础上增加汇总表或物化视图。
