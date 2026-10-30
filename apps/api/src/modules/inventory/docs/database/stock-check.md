# 库存盘点

> [返回 Inventory 数据库设计](../database.md)。盘点单据、库存批次与差异流水由 Inventory 所有。

本章维护盘点两表的职责、结构、快照与调整边界，并与[版本化 migration](../../../../../../../packages/database/migrations/)同步；公共审计与数量遵守[数据库约定](../../../../../../../docs/database-conventions.md)。

### 17. `stock_check_order`

盘点单记录一次盘点任务，单号按[统一编号规则](../../../../../docs/business-numbering.md)在创建事务内分配。状态为 `pending/counting/completed/cancelled`。首次保存实盘数量后进入 counting，允许分次保存；完成时记录实际盘点人和时间。取消原因、人和时间对未记录的历史数据可为空。

创建时由管理员选择当前有正库存的物料批次及库存状态，不能创建空清单。只保存当时账面快照，不冻结库存；后续库存变化不会改写该快照。

**`stock_check_order` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
| `check_no` | `VARCHAR(100) NOT NULL` | 盘点单号 |
| `status` | `VARCHAR(30) NOT NULL DEFAULT 'pending'` | 盘点状态，默认 `pending` |
| `check_at` | `DATETIME NULL` | 实际盘点时间 |
| `operator_id` | `BIGINT UNSIGNED NULL` | 操作人 ID |
| `remark` | `TEXT NULL` | 备注 |
| `cancel_reason` | `TEXT NULL` | 取消原因；历史未记录数据可为空 |
| `cancelled_by` | `BIGINT UNSIGNED NULL` | 取消人；历史未记录数据可为空 |
| `cancelled_at` | `DATETIME NULL` | 取消时间；历史未记录数据可为空 |
| `version` | `INT NOT NULL DEFAULT 0` | 乐观锁版本号，默认 `0` |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 创建人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间 |
| `updated_by` | `BIGINT UNSIGNED NOT NULL` | 最近修改人 |
| `updated_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | 最近修改时间 |

**`stock_check_order` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_stock_check_order_operator FOREIGN KEY (operator_id) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_stock_check_order_created_by FOREIGN KEY (created_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_stock_check_order_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_stock_check_order_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id)` |
| 唯一键 | `UNIQUE KEY uk_stock_check_order_no (check_no)` |
| 索引 | `KEY idx_stock_check_order_status_created (status, created_at)` |
| 索引 | `KEY idx_stock_check_order_cancelled_by (cancelled_by)` |
| CHECK | `CONSTRAINT chk_stock_check_order_status CHECK ( status IN ('pending','counting','completed','cancelled') )` |
| CHECK | `CONSTRAINT chk_stock_check_order_version CHECK (version >= 0)` |
| CHECK | `CONSTRAINT chk_stock_check_order_state CHECK ( (status IN ('pending','counting') AND check_at IS NULL AND operator_id IS NULL) OR (status = 'completed' AND check_at IS NOT NULL AND operator_id IS NOT NULL) OR (status = 'cancelled' AND check_at IS NULL) )` |

### 18. `stock_check_detail`

每项明细对应一个物料批次的库存状态，同单不得重复。精确物料版本、单位与真实库批一致；当前盘点覆盖 `available/pending_inspection/frozen/defective`，不含成品。

实盘数量允许为零，未录入时为空。差额为实盘减账面快照，盘盈、盘亏或相符由差额派生；未录入时差额和结果均为空，接口不能独立写入。

完成盘点须满足以下条件：

- 所有明细已录入；按批次 ID 升序锁定库存批次，对余额投影作当前读。任一当前数量与快照不同就整单拒绝，须取消后重建，不能用旧快照调整变化后的库存。
- 盘点不套用其他出库的生产预留保护。
- 每项非零差额生成一条 `stock_check_adjustment` 流水，引用真实盘点明细并核对精确物料及批次身份；相符项不生成零流水。所有明细一并标记已调整，主单完成、流水及成功审计同事务提交，不提供完成后再单独生成调整的入口。

流水防重及不可变规则见[库存账本](inventory-ledger-and-inbound.md#7-inventory_transaction)。

**`stock_check_detail` 字段定义**

| 字段 | SQL 定义 | 业务含义 |
| --- | --- | --- |
| `id` | `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` | 主键，自增 |
| `stock_check_id` | `BIGINT UNSIGNED NOT NULL` | 盘点主单 ID，关联 `stock_check_order.id` |
| `item_id` | `BIGINT UNSIGNED NOT NULL` | 库存对象 ID |
| `material_variant_id` | `BIGINT UNSIGNED NOT NULL` | 盘点的精确物料版本 ID |
| `batch_id` | `BIGINT UNSIGNED NOT NULL` | 库存批次 ID |
| `stock_status` | `VARCHAR(20) NOT NULL` | 盘点的库存状态，例如 `available`、`pending_inspection` |
| `unit_snapshot` | `VARCHAR(20) NOT NULL` | 盘点时单位快照 |
| `system_quantity` | `INT NOT NULL` | 盘点时系统账面数量 |
| `actual_quantity` | `INT NULL` | 实盘数量；尚未录入时为空 |
| `difference_quantity` | `INT GENERATED ALWAYS AS (CASE WHEN actual_quantity IS NULL THEN NULL ELSE actual_quantity-system_quantity END) STORED` | 可空生成列：实盘数量 - 系统数量 |
| `result` | `VARCHAR(20) GENERATED ALWAYS AS ( CASE WHEN actual_quantity IS NULL THEN NULL WHEN actual_quantity > system_quantity THEN 'surplus' WHEN actual_quantity < system_quantity THEN 'shortage' ELSE 'matched' END ) STORED` | 可空生成列：`surplus`、`shortage`、`matched` |
| `adjusted` | `TINYINT NOT NULL DEFAULT 0` | 是否完成盘点调整处理：`0` 否，`1` 是；相符项不生成流水也会标为已处理 |
| `remark` | `TEXT NULL` | 备注 |
| `created_by` | `BIGINT UNSIGNED NOT NULL` | 创建人 |
| `created_at` | `DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` | 创建时间，默认 `CURRENT_TIMESTAMP` |

**`stock_check_detail` 键、索引与检查约束**

| 类别 | 定义 |
| --- | --- |
| 主键 | `PRIMARY KEY (id)` |
| 外键 | `CONSTRAINT fk_stock_check_detail_order FOREIGN KEY (stock_check_id) REFERENCES stock_check_order(id)` |
| 外键 | `CONSTRAINT fk_stock_check_detail_created_by FOREIGN KEY (created_by) REFERENCES users(id)` |
| 外键 | `CONSTRAINT fk_stock_check_detail_variant FOREIGN KEY (material_variant_id, item_id) REFERENCES material_variants(id, material_id)` |
| 外键 | `CONSTRAINT fk_stock_check_detail_item FOREIGN KEY (item_id) REFERENCES materials(id)` |
| 外键 | `CONSTRAINT fk_stock_check_detail_batch_item FOREIGN KEY (batch_id,item_id) REFERENCES item_batch(id,item_id)` |
| 外键 | `CONSTRAINT fk_stock_check_detail_batch_variant FOREIGN KEY (batch_id,item_id,material_variant_id) REFERENCES item_batch(id,item_id,material_variant_id)` |
| 唯一键 | `UNIQUE KEY uk_stock_check_detail_target (stock_check_id, item_id, batch_id, stock_status)` |
| 唯一键 | `UNIQUE KEY uk_stock_check_detail_material_reference (id,item_id,material_variant_id,batch_id)` |
| 索引 | `KEY idx_stock_check_detail_batch_status (batch_id, stock_status)` |
| CHECK | `CONSTRAINT chk_stock_check_detail_system_quantity CHECK (system_quantity > 0)` |
| CHECK | `CONSTRAINT chk_stock_check_detail_actual_quantity CHECK ( actual_quantity IS NULL OR actual_quantity >= 0 )` |
| CHECK | `CONSTRAINT chk_stock_check_detail_stock_status CHECK ( stock_status IN ('available','pending_inspection','frozen','defective') )` |
| CHECK | `CONSTRAINT chk_stock_check_detail_adjusted CHECK (adjusted IN (0,1))` |
| CHECK | `CONSTRAINT chk_stock_check_detail_quantities_integer CHECK ( system_quantity = TRUNCATE(system_quantity, 0) AND (actual_quantity IS NULL OR actual_quantity = TRUNCATE(actual_quantity, 0)) )` |
| CHECK | `CONSTRAINT chk_integer_storage_stock_check_detail CHECK ( system_quantity BETWEEN 0 AND 99999999 AND actual_quantity BETWEEN 0 AND 99999999 AND difference_quantity BETWEEN -99999999 AND 99999999 )` |
