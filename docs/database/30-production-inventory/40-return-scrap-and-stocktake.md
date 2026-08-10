# 退料、报废与盘点

> [返回生产与库存总览](README.md) · [返回数据库设计总览](../README.md)。本章是生产与库存规范的组成部分，不是独立副本。

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

---

## 3.8 报废表

---

### 16. `item_scrap`

职责：维护报废记录，支持生产消耗报废、仓库侧报废、退料后报废、库存内报废等场景。

| 字段                  | 类型              | 说明                                      |
| --------------------- | ----------------- | ----------------------------------------- |
| `id`                  | `BIGINT UNSIGNED` | 主键                                      |
| `scrap_no`            | `VARCHAR(100)`    | 报废单号                                  |
| `production_batch_id` | `BIGINT UNSIGNED` | 生产批次 ID，可为空                       |
| `demand_id`           | `BIGINT UNSIGNED` | 需求 ID，可为空                           |
| `allocation_id`       | `BIGINT UNSIGNED` | 分配明细 ID，可为空                       |
| `return_detail_id`    | `BIGINT UNSIGNED` | 来源退料明细 ID，退料后报废时填写，可为空 |
| `item_id`             | `BIGINT UNSIGNED` | 报废对象 ID                               |
| `batch_id`            | `BIGINT UNSIGNED` | 报废库存批次 ID，可为空                   |
| `scrap_scene`         | `VARCHAR(40)`     | 报废场景                                  |
| `scrap_number`        | `DECIMAL(12,4)`   | 报废数量                                  |
| `unit_snapshot`       | `VARCHAR(20)`     | 报废时单位快照                            |
| `reason_type`         | `VARCHAR(50)`     | 报废原因                                  |
| `status`              | `VARCHAR(30)`     | 状态，默认 `pending`                      |
| `remark`              | `TEXT`            | 备注                                      |
| `version`             | `INT`             | 乐观锁版本号，默认 `0`                    |
| 业务审计字段          | 见统一规则        | 可变业务单据审计字段                      |

`scrap_scene` 可选语义：

| 值                      | 含义                                 | 是否影响 allocation 可再次出库量 |
| ----------------------- | ------------------------------------ | -------------------------------- |
| `warehouse_allocated`   | 已分配但未出库，在仓库侧报废         | 是                               |
| `return_after_outbound` | 出库后退回，再发生报废               | 是                               |
| `production_consumed`   | 已出库到生产后，在生产过程中消耗报废 | 否                               |
| `in_stock`              | 库存内直接报废，例如成品库存报废     | 不涉及 allocation                |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (scrap_no)`
- 外键：`FOREIGN KEY (production_batch_id) REFERENCES production_batches(id)`
- 外键：`FOREIGN KEY (demand_id, production_batch_id) REFERENCES production_item_demand(id, production_batch_id)`
- 外键：`FOREIGN KEY (allocation_id, demand_id, production_batch_id, item_id, batch_id) REFERENCES production_item_allocation(id, demand_id, production_batch_id, item_id, batch_id)`
- 外键：`FOREIGN KEY (return_detail_id, allocation_id, demand_id, production_batch_id, item_id, batch_id) REFERENCES return_detail(id, allocation_id, demand_id, production_batch_id, item_id, batch_id)`
- 外键：`FOREIGN KEY (item_id) REFERENCES products(id)`
- 外键：`FOREIGN KEY (batch_id, item_id) REFERENCES item_batch(id, item_id)`
- 检查约束：`CHECK (scrap_number > 0)`
- 检查约束：`CHECK (scrap_scene IN ('warehouse_allocated', 'return_after_outbound', 'production_consumed', 'in_stock'))`
- 检查约束：`CHECK (status IN ('pending', 'confirmed', 'cancelled'))`
- 检查约束：`warehouse_allocated` 要求 `production_batch_id`、`demand_id`、`allocation_id`、`batch_id` 非空，且 `return_detail_id` 为空
- 检查约束：`return_after_outbound` 要求 `production_batch_id`、`demand_id`、`allocation_id`、`return_detail_id`、`batch_id` 均非空
- 检查约束：`production_consumed` 要求 `production_batch_id`、`demand_id`、`allocation_id`、`batch_id` 非空，且 `return_detail_id` 为空
- 检查约束：`in_stock` 要求 `batch_id` 非空，且 `production_batch_id`、`demand_id`、`allocation_id`、`return_detail_id` 均为空
- 组合索引：`INDEX (status, created_at)`，用于报废单状态分页

说明：

- 生产消耗报废不应直接扣减原 allocation 的可再次出库量。
- 生产消耗报废如果需要补料，应新增 `production_item_demand`，并设置：

  - `demand_type = 'scrap_supplement'`
  - `parent_demand_id = 原始需求 ID`
  - `source_scrap_id = 报废记录 ID`

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
| `actual_quantity`     | `DECIMAL(12,4)`   | 实盘数量                                               |
| `difference_quantity` | `DECIMAL(12,4)`   | 生成列：实盘数量 - 系统数量                            |
| `result`              | `VARCHAR(20)`     | 生成列：`surplus`、`shortage`、`matched`               |
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
- 检查约束：`CHECK (actual_quantity >= 0)`
- 检查约束：`CHECK (stock_status IN ('available', 'pending_inspection', 'frozen', 'defective'))`
- 检查约束：`CHECK (result IN ('surplus', 'shortage', 'matched'))`
- 检查约束：`CHECK (adjusted IN (0, 1))`
- 唯一约束：`UNIQUE (stock_check_id, item_id, batch_id, stock_status)`

说明：

- `difference_quantity` 和 `result` 必须使用数据库生成列或只在查询视图中计算，禁止由接口独立写入。
- 盘点调整应生成 `inventory_transaction`，类型为 `stock_check_adjustment`。
- 盘点明细应记录盘点时的系统数量快照，避免后续库存变动影响盘点结果。

---
