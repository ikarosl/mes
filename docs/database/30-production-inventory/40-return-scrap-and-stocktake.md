# 退料、报废与盘点

> [返回生产与库存总览](README.md) · [返回数据库设计总览](../README.md)。本章是生产与库存规范的组成部分，不是独立副本。

本章退料、生产领料损耗和盘点数量均为整数：退料与损耗最小为 `1`，实盘数量允许为 `0`，盘点差异允许为负整数。数据库必须以整数 `CHECK` 拒绝小数，前后端不得用误差阈值比较或自动舍入小数。

## 3.7 退料表

---

### 14. `return_order`

职责：维护生产退料主单，记录某个生产批次的一次退料动作。

| 字段                  | 类型              | 说明                                      |
| --------------------- | ----------------- | ----------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                      |
| `return_no`           | `VARCHAR(100)`    | 退料单号                                  |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID，关联 `production_batches.id` |
| `work_order_id`       | `BIGINT UNSIGNED` | 工单 ID，冗余保存                         |
| `status`              | `VARCHAR(30)`     | 退料单状态，默认 `pending`                |
| `return_at`           | `DATETIME`        | 实际退料时间                              |
| `operator_id`         | `BIGINT UNSIGNED` | 操作人 ID                                 |
| `version`             | `INT`             | 乐观锁版本号，默认 `0`                    |
| `remark`              | `TEXT`            | 备注                                      |
| 业务审计字段          | 见统一规则        | 可变业务单据审计字段                      |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (return_no)`
- 唯一约束：`UNIQUE (id, production_batch_id)`
- 外键：`FOREIGN KEY (production_batch_id, work_order_id) REFERENCES production_batches(id, work_order_id)`
- 外键：`FOREIGN KEY (operator_id) REFERENCES users(id)`
- 检查约束：`CHECK (status IN ('pending', 'returned', 'scrapped', 'cancelled'))`
- 组合索引：`INDEX (status, created_at)`，用于退料单状态分页

说明：

- 退料主单表达一次退料动作。
- 具体退回哪个分配行、哪个批次、多少数量，由 `return_detail` 记录。
- 退料后是否继续占用原生产批次，需要由明细字段控制。
- 当前已实现的最小退料只接受已确认生产领料，固定退回 `available` 并设置 `release_after_return = 1` 释放公共库存。`release_after_return = 0` 的批次专属库存预留和退料报废仅保留设计位置，当前不得开放命令。

---

### 15. `return_detail`

职责：维护生产退料明细，记录某个分配行本次退回数量、退回后的库存状态，以及是否释放给公共库存。

| 字段                   | 类型              | 说明                                     |
| ---------------------- | ----------------- | ---------------------------------------- |
| `id`                   | `BIGINT UNSIGNED` | 主键                                     |
| `return_id`            | `BIGINT UNSIGNED` | 退料主单 ID，关联 `return_order.id`      |
| `production_batch_id`  | `BIGINT UNSIGNED` | 生产批次 ID，冗余保存                    |
| `demand_id`            | `BIGINT UNSIGNED` | 需求 ID                                  |
| `allocation_id`        | `BIGINT UNSIGNED` | 分配明细 ID                              |
| `item_id`              | `BIGINT UNSIGNED` | 退料对象 ID                              |
| `batch_id`             | `BIGINT UNSIGNED` | 退料库存批次 ID                          |
| `return_number`        | `DECIMAL(12,4)`   | 本次退料数量                             |
| `unit_snapshot`        | `VARCHAR(20)`     | 退料时单位快照                           |
| `return_stock_status`  | `VARCHAR(20)`     | 退回后的库存状态，默认 `available`       |
| `release_after_return` | `TINYINT`         | 是否退回后释放给公共库存：`0` 否，`1` 是 |
| `remark`               | `TEXT`            | 备注                                     |
| `created_by`           | `BIGINT UNSIGNED` | 创建人                                   |
| `created_at`           | `DATETIME`        | 创建时间，默认 `CURRENT_TIMESTAMP`       |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (return_id, production_batch_id) REFERENCES return_order(id, production_batch_id)`
- 外键：`FOREIGN KEY (demand_id, production_batch_id) REFERENCES production_item_demand(id, production_batch_id)`
- 外键：`FOREIGN KEY (allocation_id, demand_id, production_batch_id, item_id, batch_id) REFERENCES production_item_allocation(id, demand_id, production_batch_id, item_id, batch_id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 检查约束：`CHECK (return_number > 0)`
- 检查约束：`CHECK (return_stock_status IN ('available', 'pending_inspection', 'frozen', 'defective'))`
- 检查约束：`CHECK (release_after_return IN (0, 1))`
- 唯一约束：`UNIQUE (return_id, allocation_id)`
- 组合候选键：`UNIQUE (id, allocation_id, demand_id, production_batch_id, item_id, batch_id)`，供退料后报废精确引用具体退料明细

说明：

- `return_stock_status = available` 的退料会增加库存流水中的可用库存。
- `release_after_return = 0` 表示退回后仍绑定原生产批次，可再次出给该批次。
- `release_after_return = 1` 表示退回后释放给公共库存，不再继续占用原生产批次。
- 退料入库应生成 `inventory_transaction`，类型为 `material_return_inbound`。
- 创建待退料单时即占用可退数量；可退数量为同一 allocation 已确认领料累计减去其他 `pending/returned` 退料明细累计。取消待退料单释放占用。
- 确认退料按 `item_batch.id` 升序锁定涉及批次，重新校验可退数量，并将主单更新、正库存流水和成功审计放在同一事务。

---

## 3.8 报废表

---

### 16. `item_scrap`

设计类型：可变业务单据；确认后业务事实不可覆盖，错误处理留给后续冲销设计。

职责：当前只维护 `production_consumed` 生产领料损耗。仓库侧报废、退料后报废和库存内报废仍是未来场景，不在本表当前物理结构与应用能力中预建。

设计决策：系统将“生产授权上限”与“现场物料可用量”解耦。授权只控制批次允许生产的数量，不因领料后的现场损耗动态回收额度；实际物料损耗通过“损耗报废 → 损耗补料 → 物料需求 → 分配与出库”闭环处理，以适度降低系统复杂度，避免为追求实时物料联动而引入过高的状态维护成本。

| 字段                  | 类型              | 说明                                      |
| --------------------- | ----------------- | ----------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                      |
| `scrap_no`            | `VARCHAR(100)`    | 报废单号                                  |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID，非空                         |
| `demand_id`           | `BIGINT UNSIGNED` | 来源需求 ID，非空                         |
| `allocation_id`       | `BIGINT UNSIGNED` | 来源分配明细 ID，非空                     |
| `item_id`             | `BIGINT UNSIGNED` | 报废对象 ID                               |
| `batch_id`            | `BIGINT UNSIGNED` | 已确认领料的库存批次 ID，非空             |
| `scrap_scene`         | `VARCHAR(40)`     | 当前固定为 `production_consumed`          |
| `scrap_number`        | `DECIMAL(12,4)`   | 报废数量                                  |
| `unit_snapshot`       | `VARCHAR(20)`     | 报废时单位快照                            |
| `reason_type`         | `VARCHAR(50)`     | 报废原因                                  |
| `status`              | `VARCHAR(30)`     | 状态，默认 `pending`                      |
| `confirmed_by`        | `BIGINT UNSIGNED` | 确认损耗/报废的管理员；待处理或取消时为空 |
| `confirmed_at`        | `DATETIME`        | 确认时间；待处理或取消时为空              |
| `remark`              | `TEXT`            | 备注                                      |
| `version`             | `INT`             | 乐观锁版本号，默认 `0`                    |
| 业务审计字段          | 见统一规则        | 可变业务单据审计字段                      |

未来扩展场景语义：

| 值                      | 含义                                 | 是否影响 allocation 可再次出库量 |
| ----------------------- | ------------------------------------ | -------------------------------- |
| `warehouse_allocated`   | 已分配但未出库，在仓库侧报废         | 是                               |
| `return_after_outbound` | 出库后退回，再发生报废               | 是                               |
| `production_consumed`   | 已出库到生产后，在生产现场损坏或丢失 | 否                               |
| `in_stock`              | 库存内直接报废，例如成品库存报废     | 不涉及 allocation                |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (scrap_no)`
- 唯一约束：`UNIQUE (id, production_batch_id)`，供损耗补料单以组合外键保证同批次来源
- 外键：`FOREIGN KEY (production_batch_id) REFERENCES production_batches(id)`
- 外键：`FOREIGN KEY (demand_id, production_batch_id) REFERENCES production_item_demand(id, production_batch_id)`
- 外键：`FOREIGN KEY (allocation_id, demand_id, production_batch_id, item_id, batch_id) REFERENCES production_item_allocation(id, demand_id, production_batch_id, item_id, batch_id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 外键：`confirmed_by` 及业务审计操作者字段关联 `users.id`
- 检查约束：`CHECK (scrap_number > 0)`
- 检查约束：`CHECK (scrap_scene = 'production_consumed')`
- 检查约束：`CHECK (status IN ('pending', 'confirmed', 'cancelled'))`
- 检查约束：`pending` 要求 `confirmed_by/confirmed_at` 为空；`confirmed` 要求二者均非空；`cancelled` 要求二者为空
- 非空来源列和组合外键共同保证 `production_consumed` 必须来自同一生产批次、需求、分配行、物料和库存批次
- 组合索引：`INDEX (status, created_at)`，用于报废单状态分页

说明：

- 生产消耗报废不应直接扣减原 allocation 的可再次出库量。
- `production_consumed` 创建时只允许选择状态为 `material_outbound/doing` 的生产批次及其已确认领料分配行；物料、库存批次、需求、单位和生产批次都从服务端候选复制，不接受客户端自由拼接 ID 或单位。
- 同一分配行当前可申报损耗量为“累计确认出库量 - `pending/returned` 退料占用量 - `pending/confirmed` 的 `production_consumed` 损耗占用量”；创建和确认事务都必须重新锁定来源分配行并校验，损耗数量必须大于 `0` 且不得超过该上限。取消待确认损耗释放占用。
- 现场创建损耗记录后状态为 `pending`。管理员确认时不提供“不补料”或修改补料数量的分支；同一事务把本单改为 `confirmed`、创建一张 `source_type = 'material_loss'` 的 `production_material_supplement`，并创建且仅创建一条 `material_loss_supplement` 需求。需求物料与单位固定取来源分配行，`need_number = scrap_number`。
- 生产领料损耗补料只恢复损失的实物，不创建 `batch_step_scrap_records` 或 `batch_step_scrap_reproduction_authorization`，不增加产品补产额度，不修改批次计划量和工序可报上限。它与工序异常审批中的“产品报废并补产”是两条不同链路。
- 损耗确认、补料单、补料需求、状态版本、成功审计和 HTTP 幂等结果必须同事务提交；任一写入失败全部回滚。已确认损耗不得改量或取消，错误修正必须等待独立冲销设计。
- 通用库存报废仍未进入当前正式范围。`warehouse_allocated/return_after_outbound/in_stock` 的命令、接口和页面操作继续禁用，不得因实现生产领料损耗而一并开放。

- 库存内报废应生成 `inventory_transaction`，类型为 `scrap_outbound`。
- 只有 `status = confirmed` 的报废记录参与视图汇总。
- `warehouse_allocated` 必须校验分配仍有效且存在尚未出库、未释放的可报废数量；确认后生成负数报废库存流水。
- `return_after_outbound` 必须校验来源退料已确认，且报废数量不超过该退料明细尚未处置数量；确认后生成负数报废库存流水。
- `production_consumed` 的库存已在领料时扣减，确认报废时不得再次生成库存流水。
- `in_stock` 不虚构生产批次或需求关系，确认后从对应库存批次生成负数报废库存流水。

---

## 3.9 盘点表

---

### 17. `stock_check_order`

职责：维护库存盘点主单，记录一次盘点任务的基本信息。

| 字段          | 类型              | 说明                     |
| ------------- | ----------------- | ------------------------ |
| `id`          | `BIGINT UNSIGNED` | 主键                     |
| `check_no`    | `VARCHAR(100)`    | 盘点单号                 |
| `status`      | `VARCHAR(30)`     | 盘点状态，默认 `pending` |
| `check_at`    | `DATETIME`        | 实际盘点时间             |
| `operator_id` | `BIGINT UNSIGNED` | 操作人 ID                |
| `remark`      | `TEXT`            | 备注                     |
| `version`     | `INT`             | 乐观锁版本号，默认 `0`   |
| 业务审计字段  | 见统一规则        | 可变业务单据审计字段     |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (check_no)`
- 外键：`FOREIGN KEY (operator_id) REFERENCES users(id)`
- 检查约束：`CHECK (status IN ('pending', 'counting', 'completed', 'cancelled'))`
- 组合索引：`INDEX (status, created_at)`，用于盘点单状态分页

说明：

- 盘点主单表达一次盘点动作。
- 具体盘点了哪些库存对象、哪些批次、账面数量和实盘数量，由 `stock_check_detail` 记录。

---

### 18. `stock_check_detail`

职责：维护库存盘点明细，记录某个库存对象某个批次的账面数量、实盘数量和差异数量。

| 字段                  | 类型              | 说明                                                   |
| --------------------- | ----------------- | ------------------------------------------------------ |
| `id`                  | `BIGINT UNSIGNED` | 主键                                                   |
| `stock_check_id`      | `BIGINT UNSIGNED` | 盘点主单 ID，关联 `stock_check_order.id`               |
| `item_id`             | `BIGINT UNSIGNED` | 库存对象 ID                                            |
| `batch_id`            | `BIGINT UNSIGNED` | 库存批次 ID                                            |
| `stock_status`        | `VARCHAR(20)`     | 盘点的库存状态，例如 `available`、`pending_inspection` |
| `unit_snapshot`       | `VARCHAR(20)`     | 盘点时单位快照                                         |
| `system_quantity`     | `DECIMAL(12,4)`   | 盘点时系统账面数量                                     |
| `actual_quantity`     | `DECIMAL(12,4)`   | 实盘数量；尚未录入时为空                               |
| `difference_quantity` | `DECIMAL(12,4)`   | 可空生成列：实盘数量 - 系统数量                        |
| `result`              | `VARCHAR(20)`     | 可空生成列：`surplus`、`shortage`、`matched`           |
| `adjusted`            | `TINYINT`         | 是否已生成盘点调整流水：`0` 否，`1` 是                 |
| `remark`              | `TEXT`            | 备注                                                   |
| `created_by`          | `BIGINT UNSIGNED` | 创建人                                                 |
| `created_at`          | `DATETIME`        | 创建时间，默认 `CURRENT_TIMESTAMP`                     |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (stock_check_id) REFERENCES stock_check_order(id)`
- 外键：`FOREIGN KEY (item_id) REFERENCES products(id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 检查约束：`CHECK (system_quantity >= 0)`
- 检查约束：`CHECK (actual_quantity IS NULL OR actual_quantity >= 0)`
- 检查约束：`CHECK (stock_status IN ('available', 'pending_inspection', 'frozen', 'defective'))`
- 检查约束：`CHECK (result IS NULL OR result IN ('surplus', 'shortage', 'matched'))`
- 检查约束：`CHECK (adjusted IN (0, 1))`
- 唯一约束：`UNIQUE (stock_check_id, item_id, batch_id, stock_status)`

说明：

- `difference_quantity` 和 `result` 必须使用数据库生成列或只在查询视图中计算，禁止由接口独立写入。
- 盘点调整应生成 `inventory_transaction`，类型为 `stock_check_adjustment`。
- 盘点明细应记录盘点时的系统数量快照，避免后续库存变动影响盘点结果。
- 创建盘点单时由管理员从当前正库存 `item_batch × stock_status` 候选中选择明细，系统在创建事务内冻结账面数量；空明细、重复批次状态组合和非正库存均拒绝。
- 首次保存任意实盘数量时主单从 `pending` 进入 `counting`；允许分次保存，未录入明细保持 `actual_quantity = NULL`。
- 完成盘点要求所有明细已录入。事务按批次 ID 升序锁定库存批次并重新汇总当前账面数量；任一当前数量与快照不同则整单拒绝，要求取消后重新建单，禁止用旧快照调整变化后的库存。
- 校验通过后，差异非零的明细各生成一条 `stock_check_adjustment` 流水，匹配明细不生成零流水；全部明细统一标记 `adjusted = 1`，主单更新为 `completed`，流水、状态和成功审计同事务提交。当前不提供完成后再单独“生成调整”的第二入口。

---
