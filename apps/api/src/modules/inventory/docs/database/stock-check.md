# 库存盘点

> [返回 Inventory 数据库设计](../database.md)。盘点单据、库存批次与差异流水由 Inventory 所有。

---

### 17. `stock_check_order`

职责：维护库存盘点主单，记录一次盘点任务的基本信息。

| 字段             | 类型              | 说明                                |
| ---------------- | ----------------- | ----------------------------------- |
| `id`             | `BIGINT UNSIGNED` | 主键                                |
| `check_no`       | `VARCHAR(100)`    | 盘点单号                            |
| `status`         | `VARCHAR(30)`     | 盘点状态，默认 `pending`            |
| `check_at`       | `DATETIME`        | 实际盘点时间                        |
| `operator_id`    | `BIGINT UNSIGNED` | 操作人 ID                           |
| `remark`         | `TEXT`            | 备注                                |
| `cancel_reason`  | `TEXT`            | 取消原因；历史未记录数据可为空      |
| `cancelled_by`   | `BIGINT UNSIGNED` | 取消人；历史未记录数据可为空        |
| `cancelled_at`   | `DATETIME`        | 取消时间；历史未记录数据可为空      |
| `version`        | `INT`             | 乐观锁版本号，默认 `0`              |
| 业务审计字段     | 见统一规则        | 可变业务单据审计字段                |

约束：

- 主键：`id`
- 唯一约束：`UNIQUE (check_no)`
- 外键：`FOREIGN KEY (operator_id) REFERENCES users(id)`
- 外键：`FOREIGN KEY (cancelled_by) REFERENCES users(id)`
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
| `material_variant_id` | `BIGINT UNSIGNED` | 盘点的精确物料版本 ID                                  |
| `batch_id`            | `BIGINT UNSIGNED` | 库存批次 ID                                            |
| `stock_status`        | `VARCHAR(20)`     | 盘点的库存状态，例如 `available`、`pending_inspection` |
| `unit_snapshot`       | `VARCHAR(20)`     | 盘点时单位快照                                         |
| `system_quantity`     | `INT`   | 盘点时系统账面数量                                     |
| `actual_quantity`     | `INT`   | 实盘数量；尚未录入时为空                               |
| `difference_quantity` | `INT`   | 可空生成列：实盘数量 - 系统数量                        |
| `result`              | `VARCHAR(20)`     | 可空生成列：`surplus`、`shortage`、`matched`           |
| `adjusted`            | `TINYINT`         | 是否已生成盘点调整流水：`0` 否，`1` 是                 |
| `remark`              | `TEXT`            | 备注                                                   |
| `created_by`          | `BIGINT UNSIGNED` | 创建人                                                 |
| `created_at`          | `DATETIME`        | 创建时间，默认 `CURRENT_TIMESTAMP`                     |

约束：

- 主键：`id`
- 外键：`FOREIGN KEY (stock_check_id) REFERENCES stock_check_order(id)`
- 外键：`FOREIGN KEY (item_id) REFERENCES materials(id)`
- 外键：`FOREIGN KEY (material_variant_id, item_id) REFERENCES material_variants(id, material_id)`
- 外键：`FOREIGN KEY (batch_id, item_id, material_variant_id) REFERENCES item_batch(id, item_id, material_variant_id)`
- 检查约束：`CHECK (system_quantity > 0)`，当前只对已有正库存建立盘点快照
- 检查约束：`CHECK (actual_quantity IS NULL OR actual_quantity >= 0)`
- 检查约束：`CHECK (stock_status IN ('available', 'pending_inspection', 'frozen', 'defective'))`
- `result` 由生成表达式保证为空或 surplus／shortage／matched，没有单独的结果值域 CHECK
- 检查约束：`CHECK (adjusted IN (0, 1))`
- 唯一约束：`uk_stock_check_detail_target(stock_check_id, item_id, batch_id, stock_status)`；精确版本一致性由批次组合外键保证

说明：

- `difference_quantity` 为 STORED 生成列：`CASE WHEN actual_quantity IS NULL THEN NULL ELSE actual_quantity-system_quantity END`。
- `result` 为 STORED 生成列：`CASE WHEN actual_quantity IS NULL THEN NULL WHEN actual_quantity>system_quantity THEN 'surplus' WHEN actual_quantity<system_quantity THEN 'shortage' ELSE 'matched' END`。两列禁止由接口独立写入。
- 盘点调整应生成 `inventory_transaction`，类型为 `stock_check_adjustment`。
- 盘点明细应记录盘点时的系统数量快照，避免后续库存变动影响盘点结果。
- 创建盘点单时由管理员从当前正库存 `item_batch × stock_status` 候选中选择明细，系统在创建事务内冻结账面数量；空明细、重复批次状态组合和非正库存均拒绝。
- 首次保存任意实盘数量时主单从 `pending` 进入 `counting`；允许分次保存，未录入明细保持 `actual_quantity = NULL`。
- 完成盘点要求所有明细已录入。事务按批次 ID 升序锁定库存批次并经 Inventory 对余额投影做当前读重新取得账面数量；任一当前数量与快照不同则整单拒绝，要求取消后重新建单，禁止用旧快照调整变化后的库存。
- 校验通过后，差异非零的明细各生成一条 `stock_check_adjustment` 流水，匹配明细不生成零流水；全部明细统一标记 `adjusted = 1`，主单更新为 `completed`，流水、状态和成功审计同事务提交。当前不提供完成后再单独“生成调整”的第二入口。

---
