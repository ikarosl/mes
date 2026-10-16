-- Explicit alternative for unexecuted 202610140001. The runner requires
-- DB_MIGRATION_MODE=preserve-general-inventory and every predecessor applied.
-- Pause every writer and verify a backup before executing this nontransactional DDL.
-- Only completed purchased inbounds and completed/pending production issues are
-- convertible here. No return IDs, historical snapshots or ledger facts are invented.
-- Every data guard runs before dropping a trigger or changing a permanent table.

CREATE TEMPORARY TABLE guard_preserve_no_returns (
  ok TINYINT NOT NULL, CONSTRAINT chk_preserve_no_returns CHECK (ok=1)
);
INSERT INTO guard_preserve_no_returns SELECT IF(
  EXISTS(SELECT 1 FROM return_order) OR EXISTS(SELECT 1 FROM return_detail)
  OR EXISTS(SELECT 1 FROM inventory_transaction WHERE reference_type='return_detail'
    OR transaction_type='material_return_inbound'),0,1);
DROP TEMPORARY TABLE guard_preserve_no_returns;

-- A non-NULL source_stage, including an empty string, is real historical content.
-- The new schema has no equivalent field, so it must not be silently discarded.
CREATE TEMPORARY TABLE guard_preserve_source_stage (
  ok TINYINT NOT NULL, CONSTRAINT chk_preserve_source_stage CHECK (ok=1)
);
INSERT INTO guard_preserve_source_stage SELECT IF(
  EXISTS(SELECT 1 FROM inbound_detail WHERE source_stage IS NOT NULL),0,1);
DROP TEMPORARY TABLE guard_preserve_source_stage;

CREATE TEMPORARY TABLE guard_preserve_supported_scope (
  ok TINYINT NOT NULL, CONSTRAINT chk_preserve_supported_scope CHECK (ok=1)
);
INSERT INTO guard_preserve_supported_scope SELECT IF(
  EXISTS(SELECT 1 FROM inbound_order WHERE source_type<>'purchased' OR status<>'completed')
  OR EXISTS(SELECT 1 FROM outbound_order WHERE status NOT IN ('completed','pending_picking'))
  OR EXISTS(SELECT 1 FROM stock_check_order) OR EXISTS(SELECT 1 FROM stock_check_detail)
  OR EXISTS(SELECT 1 FROM inventory_transaction WHERE transaction_type NOT IN
    ('purchase_inbound','production_material_outbound') OR reversal_of_transaction_id IS NOT NULL)
  OR (SELECT COUNT(*) FROM permissions WHERE code='warehouse:view' AND type='menu')<>1,0,1);
DROP TEMPORARY TABLE guard_preserve_supported_scope;

CREATE TEMPORARY TABLE guard_preserve_inbound_state (
  ok TINYINT NOT NULL, CONSTRAINT chk_preserve_inbound_state CHECK (ok=1)
);
INSERT INTO guard_preserve_inbound_state SELECT IF(
  EXISTS(SELECT 1 FROM inbound_order o WHERE
    o.work_order_id IS NOT NULL OR o.production_batch_id IS NOT NULL OR o.product_id IS NOT NULL
    OR o.inbound_at IS NULL OR o.operator_id IS NULL
    OR o.cancel_reason IS NOT NULL OR o.cancelled_by IS NOT NULL OR o.cancelled_at IS NOT NULL
    OR NOT REGEXP_LIKE(o.inbound_no,'[^[:space:]]')
    OR NOT EXISTS(SELECT 1 FROM inbound_detail d WHERE d.inbound_id=o.id))
  OR EXISTS(SELECT 1 FROM inbound_detail d WHERE
    d.item_id IS NULL OR d.material_variant_id IS NULL OR d.product_id IS NOT NULL OR d.batch_id IS NULL
    OR d.inbound_number NOT BETWEEN 1 AND 99999999 OR d.stock_status<>'available'
    OR NOT REGEXP_LIKE(d.unit_snapshot,'[^[:space:]]')
    OR NOT REGEXP_LIKE(d.item_code_snapshot,'[^[:space:]]')
    OR d.procurement_receipt_line_id IS NULL OR d.procurement_receipt_revision_id IS NULL
    OR d.procurement_inspection_id IS NULL OR d.procurement_allocation_id IS NULL
    OR d.supplier_name_snapshot IS NULL OR NOT REGEXP_LIKE(d.supplier_name_snapshot,'[^[:space:]]')
    OR d.production_output_allocation_id IS NOT NULL
    OR NOT EXISTS(SELECT 1 FROM item_batch b WHERE b.id=d.batch_id
      AND b.item_id=d.item_id AND b.material_variant_id=d.material_variant_id
      AND b.product_id IS NULL AND b.unit_snapshot=d.unit_snapshot)
    OR NOT EXISTS(SELECT 1 FROM procurement_receipt_allocation a
      WHERE a.id=d.procurement_allocation_id AND a.receipt_line_id=d.procurement_receipt_line_id)),0,1);
DROP TEMPORARY TABLE guard_preserve_inbound_state;

CREATE TEMPORARY TABLE guard_preserve_outbound_state (
  ok TINYINT NOT NULL, CONSTRAINT chk_preserve_outbound_state CHECK (ok=1)
);
INSERT INTO guard_preserve_outbound_state SELECT IF(
  EXISTS(SELECT 1 FROM outbound_order o WHERE
    o.production_batch_id IS NULL OR o.work_order_id IS NULL
    OR NOT REGEXP_LIKE(o.outbound_no,'[^[:space:]]')
    OR o.cancel_source IS NOT NULL OR o.cancel_reason IS NOT NULL
    OR o.cancelled_by IS NOT NULL OR o.cancelled_at IS NOT NULL
    OR (o.status='completed' AND (o.outbound_at IS NULL OR o.operator_id IS NULL))
    OR (o.status='pending_picking' AND (o.outbound_at IS NOT NULL OR o.operator_id IS NOT NULL))
    OR NOT EXISTS(SELECT 1 FROM outbound_detail d WHERE d.outbound_id=o.id))
  OR EXISTS(SELECT 1 FROM outbound_detail d WHERE
    d.item_id IS NULL OR d.material_variant_id IS NULL OR d.production_batch_id IS NULL
    OR d.demand_id IS NULL OR d.allocation_id IS NULL OR d.batch_id IS NULL
    OR d.outbound_number NOT BETWEEN 1 AND 99999999
    OR NOT REGEXP_LIKE(d.unit_snapshot,'[^[:space:]]')
    OR NOT EXISTS(SELECT 1 FROM item_batch b WHERE b.id=d.batch_id
      AND b.item_id=d.item_id AND b.material_variant_id=d.material_variant_id
      AND b.product_id IS NULL AND b.unit_snapshot=d.unit_snapshot)),0,1);
DROP TEMPORARY TABLE guard_preserve_outbound_state;

CREATE TEMPORARY TABLE guard_preserve_ledger_sources (
  ok TINYINT NOT NULL, CONSTRAINT chk_preserve_ledger_sources CHECK (ok=1)
);
INSERT INTO guard_preserve_ledger_sources SELECT IF(
  EXISTS(SELECT 1 FROM inventory_transaction t WHERE
    t.item_id IS NULL OR t.material_variant_id IS NULL OR t.product_id IS NOT NULL
    OR t.stock_status<>'available' OR t.quantity=0 OR ABS(t.quantity)>99999999
    OR NOT REGEXP_LIKE(t.unit_snapshot,'[^[:space:]]')
    OR NOT REGEXP_LIKE(t.idempotency_key,'[^[:space:]]')
    OR (t.transaction_type='purchase_inbound' AND (
      t.reference_type<>'inbound_detail' OR t.quantity<=0
      OR NOT EXISTS(SELECT 1 FROM inbound_detail d JOIN inbound_order o ON o.id=d.inbound_id
        WHERE d.id=t.reference_detail_id AND o.source_type='purchased' AND o.status='completed'
          AND d.item_id=t.item_id AND d.material_variant_id=t.material_variant_id
          AND d.batch_id=t.batch_id AND d.inbound_number=t.quantity
          AND d.unit_snapshot=t.unit_snapshot AND d.stock_status=t.stock_status)))
    OR (t.transaction_type='production_material_outbound' AND (
      t.reference_type<>'outbound_detail' OR t.quantity>=0
      OR NOT EXISTS(SELECT 1 FROM outbound_detail d JOIN outbound_order o ON o.id=d.outbound_id
        WHERE d.id=t.reference_detail_id AND o.status='completed'
          AND d.item_id=t.item_id AND d.material_variant_id=t.material_variant_id
          AND d.batch_id=t.batch_id AND -d.outbound_number=t.quantity AND d.unit_snapshot=t.unit_snapshot))))
  OR EXISTS(SELECT 1 FROM inventory_transaction
    GROUP BY reference_type,reference_detail_id HAVING COUNT(*)<>1)
  OR EXISTS(SELECT 1 FROM inbound_detail d WHERE
    (SELECT COUNT(*) FROM inventory_transaction t WHERE t.reference_type='inbound_detail'
      AND t.reference_detail_id=d.id AND t.transaction_type='purchase_inbound')<>1)
  OR EXISTS(SELECT 1 FROM outbound_detail d JOIN outbound_order o ON o.id=d.outbound_id WHERE
    (o.status='completed' AND (SELECT COUNT(*) FROM inventory_transaction t
      WHERE t.reference_type='outbound_detail' AND t.reference_detail_id=d.id
        AND t.transaction_type='production_material_outbound')<>1)
    OR (o.status='pending_picking' AND EXISTS(SELECT 1 FROM inventory_transaction t
      WHERE t.reference_type='outbound_detail' AND t.reference_detail_id=d.id))),0,1);
DROP TEMPORARY TABLE guard_preserve_ledger_sources;

CREATE TEMPORARY TABLE guard_preserve_batch_snapshots (
  ok TINYINT NOT NULL, CONSTRAINT chk_preserve_batch_snapshots CHECK (ok=1)
);
INSERT INTO guard_preserve_batch_snapshots SELECT IF(
  EXISTS(SELECT 1 FROM item_batch WHERE NOT REGEXP_LIKE(item_code_snapshot,'[^[:space:]]')
    OR NOT REGEXP_LIKE(unit_snapshot,'[^[:space:]]') OR NOT REGEXP_LIKE(batch_code,'[^[:space:]]')
    OR (material_variant_code_snapshot IS NOT NULL
      AND NOT REGEXP_LIKE(material_variant_code_snapshot,'[^[:space:]]'))),0,1);
DROP TEMPORARY TABLE guard_preserve_batch_snapshots;

-- The structural suffix below matches the original migration. Added columns are
-- populated from existing identities before NOT NULL, CHECK, UNIQUE and FK changes.

DROP TRIGGER trg_finished_inbound_detail_insert;
DROP TRIGGER trg_finished_inbound_detail_update;
DROP TRIGGER trg_finished_inbound_detail_delete;
DROP TRIGGER trg_finished_inbound_order_insert;
DROP TRIGGER trg_finished_inbound_order_update;
DROP TRIGGER trg_finished_inventory_transaction_insert;

ALTER TABLE inbound_order
  DROP FOREIGN KEY fk_inbound_order_batch_work_order,
  DROP FOREIGN KEY fk_inbound_order_cancelled_by,
  DROP FOREIGN KEY fk_inbound_order_created_by,
  DROP FOREIGN KEY fk_inbound_order_operator,
  DROP FOREIGN KEY fk_inbound_order_updated_by,
  DROP FOREIGN KEY fk_inbound_order_work_order;

ALTER TABLE inbound_detail
  DROP FOREIGN KEY fk_inbound_detail_allocation,
  DROP FOREIGN KEY fk_inbound_detail_batch_item,
  DROP FOREIGN KEY fk_inbound_detail_batch_product,
  DROP FOREIGN KEY fk_inbound_detail_batch_variant,
  DROP FOREIGN KEY fk_inbound_detail_created_by,
  DROP FOREIGN KEY fk_inbound_detail_finished_order,
  DROP FOREIGN KEY fk_inbound_detail_item,
  DROP FOREIGN KEY fk_inbound_detail_order,
  DROP FOREIGN KEY fk_inbound_detail_output_allocation,
  DROP FOREIGN KEY fk_inbound_detail_procurement_inspection,
  DROP FOREIGN KEY fk_inbound_detail_procurement_material,
  DROP FOREIGN KEY fk_inbound_detail_procurement_revision,
  DROP FOREIGN KEY fk_inbound_detail_variant;

ALTER TABLE outbound_order
  DROP FOREIGN KEY fk_outbound_order_batch_work_order,
  DROP FOREIGN KEY fk_outbound_order_cancelled_by,
  DROP FOREIGN KEY fk_outbound_order_created_by,
  DROP FOREIGN KEY fk_outbound_order_operator,
  DROP FOREIGN KEY fk_outbound_order_updated_by;

ALTER TABLE outbound_detail
  DROP FOREIGN KEY fk_outbound_detail_allocation,
  DROP FOREIGN KEY fk_outbound_detail_allocation_variant,
  DROP FOREIGN KEY fk_outbound_detail_batch_variant,
  DROP FOREIGN KEY fk_outbound_detail_created_by,
  DROP FOREIGN KEY fk_outbound_detail_demand_batch,
  DROP FOREIGN KEY fk_outbound_detail_order_batch,
  DROP FOREIGN KEY fk_outbound_detail_stock_batch;

ALTER TABLE inventory_transaction
  DROP FOREIGN KEY fk_inventory_transaction_batch_item,
  DROP FOREIGN KEY fk_inventory_transaction_batch_product,
  DROP FOREIGN KEY fk_inventory_transaction_batch_variant,
  DROP FOREIGN KEY fk_inventory_transaction_created_by,
  DROP FOREIGN KEY fk_inventory_transaction_finished_detail,
  DROP FOREIGN KEY fk_inventory_transaction_item,
  DROP FOREIGN KEY fk_inventory_transaction_reversal;

ALTER TABLE inbound_order
  DROP CHECK chk_inbound_order_finished_identity,
  DROP CHECK chk_inbound_order_source_type,
  DROP CHECK chk_inbound_order_status,
  DROP CHECK chk_inbound_order_version,
  DROP INDEX uk_inbound_order_no,
  DROP INDEX uk_inbound_order_id_source,
  DROP INDEX uk_inbound_order_id_product,
  DROP INDEX idx_inbound_order_status_created,
  DROP INDEX fk_inbound_order_work_order,
  DROP INDEX fk_inbound_order_batch_work_order,
  DROP INDEX fk_inbound_order_operator,
  DROP INDEX fk_inbound_order_created_by,
  DROP INDEX fk_inbound_order_updated_by,
  DROP INDEX idx_inbound_order_cancelled_by;

ALTER TABLE inbound_detail
  DROP CHECK chk_inbound_detail_identity,
  DROP CHECK chk_inbound_detail_procurement_source,
  DROP CHECK chk_inbound_detail_quantity,
  DROP CHECK chk_inbound_detail_quantity_integer,
  DROP CHECK chk_inbound_detail_stock_status,
  DROP CHECK chk_inbound_detail_supplier_snapshot,
  DROP CHECK chk_integer_storage_inbound_detail,
  DROP INDEX uk_inbound_detail_finished_reference,
  DROP INDEX idx_inbound_detail_item_batch,
  DROP INDEX fk_inbound_detail_created_by,
  DROP INDEX idx_inbound_detail_batch_product,
  DROP INDEX fk_inbound_detail_variant,
  DROP INDEX idx_inbound_detail_procurement_receipt,
  DROP INDEX idx_inbound_detail_procurement_inspection,
  DROP INDEX fk_inbound_detail_procurement_revision,
  DROP INDEX fk_inbound_detail_procurement_material,
  DROP INDEX fk_inbound_detail_procurement_inspection,
  DROP INDEX idx_inbound_detail_allocation,
  DROP INDEX fk_inbound_detail_allocation,
  DROP INDEX idx_inbound_detail_order_product,
  DROP INDEX idx_inbound_detail_output_allocation,
  DROP INDEX fk_inbound_detail_batch_variant;

ALTER TABLE outbound_order
  DROP CHECK chk_outbound_order_cancel_source,
  DROP CHECK chk_outbound_order_status,
  DROP CHECK chk_outbound_order_version,
  DROP INDEX uk_outbound_order_no,
  DROP INDEX uk_outbound_order_id_batch,
  DROP INDEX idx_outbound_order_status_created,
  DROP INDEX idx_outbound_order_batch_created,
  DROP INDEX fk_outbound_order_batch_work_order,
  DROP INDEX fk_outbound_order_operator,
  DROP INDEX fk_outbound_order_created_by,
  DROP INDEX fk_outbound_order_updated_by,
  DROP INDEX idx_outbound_order_cancelled_by;

ALTER TABLE outbound_detail
  DROP CHECK chk_integer_storage_outbound_detail,
  DROP CHECK chk_outbound_detail_quantity,
  DROP CHECK chk_outbound_detail_quantity_integer,
  DROP INDEX uk_outbound_detail_order_allocation,
  DROP INDEX idx_outbound_detail_demand,
  DROP INDEX idx_outbound_detail_allocation,
  DROP INDEX fk_outbound_detail_order_batch,
  DROP INDEX fk_outbound_detail_demand_batch,
  DROP INDEX fk_outbound_detail_created_by,
  DROP INDEX fk_outbound_detail_allocation_variant,
  DROP INDEX fk_outbound_detail_batch_variant;

ALTER TABLE inventory_transaction
  DROP CHECK chk_integer_storage_inventory_transaction,
  DROP CHECK chk_inventory_transaction_finished_scope,
  DROP CHECK chk_inventory_transaction_identity,
  DROP CHECK chk_inventory_transaction_quantity,
  DROP CHECK chk_inventory_transaction_quantity_integer,
  DROP CHECK chk_inventory_transaction_stock_status,
  DROP CHECK chk_inventory_transaction_type,
  DROP INDEX uk_inventory_transaction_idempotency,
  DROP INDEX uk_inventory_transaction_reversal,
  DROP INDEX uk_inventory_transaction_finished_once,
  DROP INDEX idx_inventory_transaction_group,
  DROP INDEX idx_inventory_transaction_stock,
  DROP INDEX idx_inventory_transaction_reference,
  DROP INDEX fk_inventory_transaction_created_by,
  DROP INDEX idx_inventory_transaction_product_stock,
  DROP INDEX idx_inventory_transaction_batch_product,
  DROP INDEX idx_inventory_transaction_finished_detail,
  DROP INDEX fk_inventory_transaction_batch_variant;

ALTER TABLE inbound_order
  MODIFY COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT FIRST,
  MODIFY COLUMN inbound_no VARCHAR(100) NOT NULL AFTER id,
  MODIFY COLUMN source_type VARCHAR(30) NOT NULL AFTER inbound_no,
  MODIFY COLUMN work_order_id BIGINT UNSIGNED NULL AFTER source_type,
  MODIFY COLUMN production_batch_id BIGINT UNSIGNED NULL AFTER work_order_id,
  MODIFY COLUMN product_id BIGINT UNSIGNED NULL AFTER production_batch_id,
  MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'pending' AFTER product_id,
  MODIFY COLUMN inbound_at DATETIME NULL AFTER status,
  MODIFY COLUMN operator_id BIGINT UNSIGNED NULL AFTER inbound_at,
  ADD COLUMN reason TEXT NULL AFTER operator_id,
  MODIFY COLUMN remark TEXT NULL AFTER reason,
  MODIFY COLUMN cancel_reason TEXT NULL AFTER remark,
  MODIFY COLUMN cancelled_by BIGINT UNSIGNED NULL AFTER cancel_reason,
  MODIFY COLUMN cancelled_at DATETIME NULL AFTER cancelled_by,
  MODIFY COLUMN version INT NOT NULL DEFAULT 0 AFTER cancelled_at,
  MODIFY COLUMN created_by BIGINT UNSIGNED NOT NULL AFTER version,
  MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by,
  MODIFY COLUMN updated_by BIGINT UNSIGNED NOT NULL AFTER created_at,
  MODIFY COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER updated_by;

ALTER TABLE inbound_detail
  DROP COLUMN source_stage,
  MODIFY COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT FIRST,
  MODIFY COLUMN inbound_id BIGINT UNSIGNED NOT NULL AFTER id,
  ADD COLUMN line_no INT NULL AFTER inbound_id,
  ADD COLUMN source_type VARCHAR(30) NULL AFTER line_no,
  MODIFY COLUMN item_id BIGINT UNSIGNED NULL AFTER source_type,
  MODIFY COLUMN material_variant_id BIGINT UNSIGNED NULL AFTER item_id,
  MODIFY COLUMN product_id BIGINT UNSIGNED NULL AFTER material_variant_id,
  MODIFY COLUMN batch_id BIGINT UNSIGNED NULL AFTER product_id,
  ADD COLUMN target_mode VARCHAR(20) NULL AFTER batch_id,
  ADD COLUMN new_batch_key VARCHAR(100) COLLATE utf8mb4_bin NULL AFTER target_mode,
  MODIFY COLUMN inbound_number INT NOT NULL AFTER new_batch_key,
  MODIFY COLUMN unit_snapshot VARCHAR(20) NOT NULL AFTER inbound_number,
  MODIFY COLUMN item_code_snapshot VARCHAR(100) NOT NULL AFTER unit_snapshot,
  MODIFY COLUMN stock_status VARCHAR(20) NOT NULL DEFAULT 'available' AFTER item_code_snapshot,
  MODIFY COLUMN procurement_receipt_line_id BIGINT UNSIGNED NULL AFTER stock_status,
  MODIFY COLUMN procurement_receipt_revision_id BIGINT UNSIGNED NULL AFTER procurement_receipt_line_id,
  MODIFY COLUMN procurement_inspection_id BIGINT UNSIGNED NULL AFTER procurement_receipt_revision_id,
  MODIFY COLUMN procurement_allocation_id BIGINT UNSIGNED NULL AFTER procurement_inspection_id,
  MODIFY COLUMN supplier_name_snapshot VARCHAR(100) NULL AFTER procurement_allocation_id,
  MODIFY COLUMN production_output_allocation_id BIGINT UNSIGNED NULL AFTER supplier_name_snapshot,
  ADD COLUMN production_batch_id BIGINT UNSIGNED NULL AFTER production_output_allocation_id,
  ADD COLUMN demand_id BIGINT UNSIGNED NULL AFTER production_batch_id,
  ADD COLUMN return_allocation_id BIGINT UNSIGNED NULL AFTER demand_id,
  MODIFY COLUMN remark TEXT NULL AFTER return_allocation_id,
  MODIFY COLUMN created_by BIGINT UNSIGNED NOT NULL AFTER remark,
  MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by,
  ADD COLUMN updated_by BIGINT UNSIGNED NULL AFTER created_at,
  ADD COLUMN updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER updated_by,
  ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0 AFTER updated_at,
  ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER is_deleted,
  ADD COLUMN deleted_at DATETIME NULL AFTER deleted_by;

ALTER TABLE outbound_order
  MODIFY COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT FIRST,
  MODIFY COLUMN outbound_no VARCHAR(100) NOT NULL AFTER id,
  ADD COLUMN source_type VARCHAR(30) NULL AFTER outbound_no,
  MODIFY COLUMN production_batch_id BIGINT UNSIGNED NULL AFTER source_type,
  MODIFY COLUMN work_order_id BIGINT UNSIGNED NULL AFTER production_batch_id,
  MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'pending_picking' AFTER work_order_id,
  MODIFY COLUMN outbound_at DATETIME NULL AFTER status,
  MODIFY COLUMN operator_id BIGINT UNSIGNED NULL AFTER outbound_at,
  ADD COLUMN reason TEXT NULL AFTER operator_id,
  MODIFY COLUMN remark TEXT NULL AFTER reason,
  MODIFY COLUMN cancel_source VARCHAR(30) NULL AFTER remark,
  MODIFY COLUMN cancel_reason TEXT NULL AFTER cancel_source,
  MODIFY COLUMN cancelled_by BIGINT UNSIGNED NULL AFTER cancel_reason,
  MODIFY COLUMN cancelled_at DATETIME NULL AFTER cancelled_by,
  MODIFY COLUMN version INT NOT NULL DEFAULT 0 AFTER cancelled_at,
  MODIFY COLUMN created_by BIGINT UNSIGNED NOT NULL AFTER version,
  MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by,
  MODIFY COLUMN updated_by BIGINT UNSIGNED NOT NULL AFTER created_at,
  MODIFY COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER updated_by;

ALTER TABLE outbound_detail
  MODIFY COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT FIRST,
  MODIFY COLUMN outbound_id BIGINT UNSIGNED NOT NULL AFTER id,
  ADD COLUMN line_no INT NULL AFTER outbound_id,
  ADD COLUMN source_type VARCHAR(30) NULL AFTER line_no,
  MODIFY COLUMN production_batch_id BIGINT UNSIGNED NULL AFTER source_type,
  MODIFY COLUMN demand_id BIGINT UNSIGNED NULL AFTER production_batch_id,
  MODIFY COLUMN allocation_id BIGINT UNSIGNED NULL AFTER demand_id,
  MODIFY COLUMN item_id BIGINT UNSIGNED NULL AFTER allocation_id,
  MODIFY COLUMN material_variant_id BIGINT UNSIGNED NULL AFTER item_id,
  ADD COLUMN product_id BIGINT UNSIGNED NULL AFTER material_variant_id,
  MODIFY COLUMN batch_id BIGINT UNSIGNED NOT NULL AFTER product_id,
  MODIFY COLUMN outbound_number INT NOT NULL AFTER batch_id,
  MODIFY COLUMN unit_snapshot VARCHAR(20) NOT NULL AFTER outbound_number,
  ADD COLUMN stock_status VARCHAR(20) NOT NULL DEFAULT 'available' AFTER unit_snapshot,
  ADD COLUMN remark TEXT NULL AFTER stock_status,
  MODIFY COLUMN created_by BIGINT UNSIGNED NOT NULL AFTER remark,
  MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by,
  ADD COLUMN updated_by BIGINT UNSIGNED NULL AFTER created_at,
  ADD COLUMN updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER updated_by,
  ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0 AFTER updated_at,
  ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER is_deleted,
  ADD COLUMN deleted_at DATETIME NULL AFTER deleted_by;

ALTER TABLE inventory_transaction
  MODIFY COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT FIRST,
  MODIFY COLUMN item_id BIGINT UNSIGNED NULL AFTER id,
  MODIFY COLUMN material_variant_id BIGINT UNSIGNED NULL AFTER item_id,
  MODIFY COLUMN product_id BIGINT UNSIGNED NULL AFTER material_variant_id,
  MODIFY COLUMN batch_id BIGINT UNSIGNED NOT NULL AFTER product_id,
  MODIFY COLUMN transaction_type VARCHAR(30) NOT NULL AFTER batch_id,
  MODIFY COLUMN quantity INT NOT NULL AFTER transaction_type,
  MODIFY COLUMN unit_snapshot VARCHAR(20) NOT NULL AFTER quantity,
  MODIFY COLUMN stock_status VARCHAR(20) NOT NULL DEFAULT 'available' AFTER unit_snapshot,
  MODIFY COLUMN reference_type VARCHAR(50) NOT NULL AFTER stock_status,
  MODIFY COLUMN reference_detail_id BIGINT UNSIGNED NOT NULL AFTER reference_type,
  MODIFY COLUMN idempotency_key VARCHAR(150) NOT NULL AFTER reference_detail_id,
  MODIFY COLUMN transaction_group_key VARCHAR(150) NULL AFTER idempotency_key,
  MODIFY COLUMN reversal_of_transaction_id BIGINT UNSIGNED NULL AFTER transaction_group_key,
  MODIFY COLUMN remark TEXT NULL AFTER reversal_of_transaction_id,
  MODIFY COLUMN created_by BIGINT UNSIGNED NOT NULL AFTER remark,
  MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by,
  ADD COLUMN inbound_detail_ref BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN reference_type='inbound_detail' THEN reference_detail_id ELSE NULL END) STORED AFTER created_at,
  ADD COLUMN outbound_detail_ref BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN reference_type='outbound_detail' THEN reference_detail_id ELSE NULL END) STORED AFTER inbound_detail_ref,
  ADD COLUMN stock_check_detail_ref BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN reference_type='stock_check_detail' THEN reference_detail_id ELSE NULL END) STORED AFTER outbound_detail_ref,
  ADD COLUMN original_posting_key VARCHAR(100) GENERATED ALWAYS AS (CASE WHEN reversal_of_transaction_id IS NULL AND reference_type IN ('inbound_detail','outbound_detail','stock_check_detail') THEN CONCAT(reference_type,':',reference_detail_id) ELSE NULL END) STORED AFTER stock_check_detail_ref;

-- Existing IDs remain unchanged. Stable line numbers are a deterministic ordering
-- of original IDs within each original document, not newly invented source facts.
CREATE TEMPORARY TABLE preserve_inbound_lines (id BIGINT UNSIGNED PRIMARY KEY, line_no INT NOT NULL);
INSERT INTO preserve_inbound_lines (id,line_no)
  SELECT id,ROW_NUMBER() OVER(PARTITION BY inbound_id ORDER BY id) FROM inbound_detail;
UPDATE inbound_detail d JOIN preserve_inbound_lines numbered ON numbered.id=d.id
  JOIN inbound_order o ON o.id=d.inbound_id
SET d.line_no=numbered.line_no,d.source_type=o.source_type,d.target_mode='existing',
  d.updated_by=d.created_by,d.updated_at=d.created_at;
DROP TEMPORARY TABLE preserve_inbound_lines;

-- Explicitly retain the old automatic-update timestamp while adding source_type.
UPDATE outbound_order SET source_type='production_material',updated_at=updated_at;
CREATE TEMPORARY TABLE preserve_outbound_lines (id BIGINT UNSIGNED PRIMARY KEY, line_no INT NOT NULL);
INSERT INTO preserve_outbound_lines (id,line_no)
  SELECT id,ROW_NUMBER() OVER(PARTITION BY outbound_id ORDER BY id) FROM outbound_detail;
UPDATE outbound_detail d JOIN preserve_outbound_lines numbered ON numbered.id=d.id
SET d.line_no=numbered.line_no,d.source_type='production_material',
  d.updated_by=d.created_by,d.updated_at=d.created_at;
DROP TEMPORARY TABLE preserve_outbound_lines;

-- The new edit-audit columns start at the original creation evidence. They do not
-- assert that a historical edit happened or copy a parent document's last editor.
ALTER TABLE inbound_detail
  MODIFY COLUMN line_no INT NOT NULL,
  MODIFY COLUMN source_type VARCHAR(30) NOT NULL,
  MODIFY COLUMN target_mode VARCHAR(20) NOT NULL,
  MODIFY COLUMN updated_by BIGINT UNSIGNED NOT NULL,
  MODIFY COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE outbound_order MODIFY COLUMN source_type VARCHAR(30) NOT NULL;
ALTER TABLE outbound_detail
  MODIFY COLUMN line_no INT NOT NULL,
  MODIFY COLUMN source_type VARCHAR(30) NOT NULL,
  MODIFY COLUMN updated_by BIGINT UNSIGNED NOT NULL,
  MODIFY COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE inbound_order
  ADD UNIQUE KEY uk_inbound_order_no (`inbound_no`),
  ADD UNIQUE KEY uk_inbound_order_id_source (`id`,`source_type`),
  ADD UNIQUE KEY uk_inbound_order_id_batch (`id`,`production_batch_id`),
  ADD KEY idx_inbound_order_source_status_created (`source_type`,`status`,`created_at`,`id`),
  ADD KEY idx_inbound_order_batch_source_status (`production_batch_id`,`source_type`,`status`,`id`),
  ADD KEY idx_inbound_order_work_order (`work_order_id`,`id`),
  ADD KEY idx_inbound_order_batch_work_order (`production_batch_id`,`work_order_id`),
  ADD KEY idx_inbound_order_operator_id (`operator_id`),
  ADD KEY idx_inbound_order_cancelled_by (`cancelled_by`),
  ADD KEY idx_inbound_order_created_by (`created_by`),
  ADD KEY idx_inbound_order_updated_by (`updated_by`),
  ADD KEY idx_inbound_order_product (`product_id`),
  ADD KEY idx_inbound_order_batch_product (`production_batch_id`,`product_id`),
  ADD CONSTRAINT chk_inbound_order_status CHECK (status IN ('pending','completed','cancelled')),
  ADD CONSTRAINT chk_inbound_order_version CHECK (version>=0),
  ADD CONSTRAINT chk_inbound_order_number CHECK (CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(inbound_no,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0),
  ADD CONSTRAINT chk_inbound_order_state CHECK (
    (status='pending' AND inbound_at IS NULL AND operator_id IS NULL AND cancel_reason IS NULL AND cancelled_by IS NULL AND cancelled_at IS NULL)
    OR (status='completed' AND inbound_at IS NOT NULL AND operator_id IS NOT NULL AND cancel_reason IS NULL AND cancelled_by IS NULL AND cancelled_at IS NULL)
    OR (status='cancelled' AND inbound_at IS NULL AND operator_id IS NULL AND cancel_reason IS NOT NULL AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cancel_reason,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0)
  ),
  ADD CONSTRAINT chk_inbound_order_source_type CHECK (source_type IN ('purchased','finished_product','return_inbound','other')),
  ADD CONSTRAINT chk_inbound_order_source CHECK (
  (source_type='purchased' AND work_order_id IS NULL AND production_batch_id IS NULL AND product_id IS NULL AND reason IS NULL)
  OR (source_type='finished_product' AND work_order_id IS NOT NULL AND production_batch_id IS NOT NULL AND product_id IS NOT NULL AND reason IS NULL)
  OR (source_type='return_inbound' AND work_order_id IS NOT NULL AND production_batch_id IS NOT NULL AND product_id IS NULL AND reason IS NULL)
  OR (source_type='other' AND work_order_id IS NULL AND production_batch_id IS NULL AND product_id IS NULL AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(reason,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0)
);

ALTER TABLE inbound_detail
  ADD UNIQUE KEY uk_inbound_detail_order_line (`inbound_id`,`line_no`),
  ADD UNIQUE KEY uk_inbound_detail_order_allocation (`inbound_id`,`return_allocation_id`),
  ADD UNIQUE KEY uk_inbound_detail_material_reference (`id`,`item_id`,`material_variant_id`,`batch_id`),
  ADD UNIQUE KEY uk_inbound_detail_product_reference (`id`,`product_id`,`batch_id`),
  ADD KEY idx_inbound_detail_order_deleted (`inbound_id`,`is_deleted`,`id`),
  ADD KEY idx_inbound_detail_order_source (`inbound_id`,`source_type`),
  ADD KEY idx_inbound_detail_order_batch (`inbound_id`,`production_batch_id`),
  ADD KEY idx_inbound_detail_batch (`batch_id`,`id`),
  ADD KEY idx_inbound_detail_batch_material (`batch_id`,`item_id`,`material_variant_id`),
  ADD KEY idx_inbound_detail_batch_product (`batch_id`,`product_id`),
  ADD KEY idx_inbound_detail_item (`item_id`,`id`),
  ADD KEY idx_inbound_detail_variant (`material_variant_id`,`item_id`),
  ADD KEY idx_inbound_detail_product (`product_id`,`id`),
  ADD KEY idx_inbound_detail_demand_batch (`demand_id`,`production_batch_id`),
  ADD KEY idx_inbound_detail_created_by (`created_by`),
  ADD KEY idx_inbound_detail_updated_by (`updated_by`),
  ADD KEY idx_inbound_detail_deleted_by (`deleted_by`),
  ADD KEY idx_inbound_detail_new_batch (`inbound_id`,`new_batch_key`),
  ADD KEY idx_inbound_detail_procurement_allocation (`procurement_allocation_id`,`id`),
  ADD KEY idx_inbound_detail_procurement_receipt (`procurement_receipt_line_id`,`id`),
  ADD KEY idx_inbound_detail_procurement_inspection (`procurement_inspection_id`,`id`),
  ADD KEY idx_inbound_detail_output_allocation (`production_output_allocation_id`,`id`),
  ADD KEY idx_inbound_detail_return_allocation (`return_allocation_id`,`id`),
  ADD KEY idx_inbound_detail_return_source (`return_allocation_id`,`demand_id`,`production_batch_id`,`item_id`,`batch_id`,`material_variant_id`),
  ADD KEY idx_inbound_detail_procurement_material (`procurement_receipt_line_id`,`item_id`,`material_variant_id`),
  ADD KEY idx_inbound_detail_procurement_revision (`procurement_receipt_revision_id`,`procurement_receipt_line_id`),
  ADD KEY idx_inbound_detail_procurement_inspection_source (`procurement_inspection_id`,`procurement_receipt_line_id`),
  ADD KEY idx_inbound_detail_procurement_allocation_source (`procurement_allocation_id`,`procurement_receipt_line_id`),
  ADD CONSTRAINT chk_inbound_detail_identity CHECK ((item_id IS NOT NULL AND material_variant_id IS NOT NULL AND product_id IS NULL) OR (item_id IS NULL AND material_variant_id IS NULL AND product_id IS NOT NULL)),
  ADD CONSTRAINT chk_inbound_detail_quantity CHECK (inbound_number BETWEEN 1 AND 99999999),
  ADD CONSTRAINT chk_inbound_detail_line CHECK (line_no>0),
  ADD CONSTRAINT chk_inbound_detail_unit CHECK (CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(unit_snapshot,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0),
  ADD CONSTRAINT chk_inbound_detail_stock_status CHECK (stock_status='available'),
  ADD CONSTRAINT chk_inbound_detail_deletion CHECK ((is_deleted=0 AND deleted_by IS NULL AND deleted_at IS NULL) OR (is_deleted=1 AND source_type='other' AND deleted_by IS NOT NULL AND deleted_at IS NOT NULL)),
  ADD CONSTRAINT chk_inbound_detail_code CHECK (CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(item_code_snapshot,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0),
  ADD CONSTRAINT chk_inbound_detail_target CHECK (
  (target_mode='existing' AND batch_id IS NOT NULL AND new_batch_key IS NULL)
  OR (target_mode='new' AND new_batch_key IS NOT NULL AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(new_batch_key,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0 AND OCTET_LENGTH(new_batch_key)=OCTET_LENGTH(TRIM(new_batch_key)))
),
  ADD CONSTRAINT chk_inbound_detail_source CHECK (
  (source_type='purchased' AND item_id IS NOT NULL AND procurement_receipt_line_id IS NOT NULL AND procurement_receipt_revision_id IS NOT NULL AND procurement_inspection_id IS NOT NULL AND procurement_allocation_id IS NOT NULL AND supplier_name_snapshot IS NOT NULL AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(supplier_name_snapshot,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0 AND production_output_allocation_id IS NULL AND production_batch_id IS NULL AND demand_id IS NULL AND return_allocation_id IS NULL)
  OR (source_type='finished_product' AND product_id IS NOT NULL AND procurement_receipt_line_id IS NULL AND procurement_receipt_revision_id IS NULL AND procurement_inspection_id IS NULL AND procurement_allocation_id IS NULL AND supplier_name_snapshot IS NULL AND production_output_allocation_id IS NOT NULL AND production_batch_id IS NULL AND demand_id IS NULL AND return_allocation_id IS NULL)
  OR (source_type='return_inbound' AND item_id IS NOT NULL AND procurement_receipt_line_id IS NULL AND procurement_receipt_revision_id IS NULL AND procurement_inspection_id IS NULL AND procurement_allocation_id IS NULL AND supplier_name_snapshot IS NULL AND production_output_allocation_id IS NULL AND production_batch_id IS NOT NULL AND demand_id IS NOT NULL AND return_allocation_id IS NOT NULL AND target_mode='existing')
  OR (source_type='other' AND procurement_receipt_line_id IS NULL AND procurement_receipt_revision_id IS NULL AND procurement_inspection_id IS NULL AND procurement_allocation_id IS NULL AND supplier_name_snapshot IS NULL AND production_output_allocation_id IS NULL AND production_batch_id IS NULL AND demand_id IS NULL AND return_allocation_id IS NULL)
);

ALTER TABLE outbound_order
  ADD UNIQUE KEY uk_outbound_order_no (`outbound_no`),
  ADD UNIQUE KEY uk_outbound_order_id_source (`id`,`source_type`),
  ADD UNIQUE KEY uk_outbound_order_id_batch (`id`,`production_batch_id`),
  ADD KEY idx_outbound_order_source_status_created (`source_type`,`status`,`created_at`,`id`),
  ADD KEY idx_outbound_order_batch_source_status (`production_batch_id`,`source_type`,`status`,`id`),
  ADD KEY idx_outbound_order_work_order (`work_order_id`,`id`),
  ADD KEY idx_outbound_order_batch_work_order (`production_batch_id`,`work_order_id`),
  ADD KEY idx_outbound_order_operator_id (`operator_id`),
  ADD KEY idx_outbound_order_cancelled_by (`cancelled_by`),
  ADD KEY idx_outbound_order_created_by (`created_by`),
  ADD KEY idx_outbound_order_updated_by (`updated_by`),
  ADD CONSTRAINT chk_outbound_order_status CHECK (status IN ('pending_picking','completed','cancelled')),
  ADD CONSTRAINT chk_outbound_order_version CHECK (version>=0),
  ADD CONSTRAINT chk_outbound_order_number CHECK (CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(outbound_no,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0),
  ADD CONSTRAINT chk_outbound_order_state CHECK (
    (status='pending_picking' AND outbound_at IS NULL AND operator_id IS NULL AND cancel_reason IS NULL AND cancelled_by IS NULL AND cancelled_at IS NULL AND cancel_source IS NULL)
    OR (status='completed' AND outbound_at IS NOT NULL AND operator_id IS NOT NULL AND cancel_reason IS NULL AND cancelled_by IS NULL AND cancelled_at IS NULL AND cancel_source IS NULL)
    OR (status='cancelled' AND outbound_at IS NULL AND operator_id IS NULL AND cancel_reason IS NOT NULL AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND cancel_source IS NOT NULL AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cancel_reason,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0)
  ),
  ADD CONSTRAINT chk_outbound_order_source_type CHECK (source_type IN ('production_material','other')),
  ADD CONSTRAINT chk_outbound_order_source CHECK (
  (source_type='production_material' AND production_batch_id IS NOT NULL AND work_order_id IS NOT NULL AND reason IS NULL)
  OR (source_type='other' AND production_batch_id IS NULL AND work_order_id IS NULL AND reason IS NOT NULL AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(reason,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0)
),
  ADD CONSTRAINT chk_outbound_order_cancel_source CHECK (cancel_source IS NULL OR (source_type='other' AND cancel_source='manual') OR (source_type='production_material' AND cancel_source IN ('manual','production_batch','production_termination')));

ALTER TABLE outbound_detail
  ADD UNIQUE KEY uk_outbound_detail_order_line (`outbound_id`,`line_no`),
  ADD UNIQUE KEY uk_outbound_detail_order_allocation (`outbound_id`,`allocation_id`),
  ADD UNIQUE KEY uk_outbound_detail_material_reference (`id`,`item_id`,`material_variant_id`,`batch_id`),
  ADD UNIQUE KEY uk_outbound_detail_product_reference (`id`,`product_id`,`batch_id`),
  ADD KEY idx_outbound_detail_order_deleted (`outbound_id`,`is_deleted`,`id`),
  ADD KEY idx_outbound_detail_order_source (`outbound_id`,`source_type`),
  ADD KEY idx_outbound_detail_order_batch (`outbound_id`,`production_batch_id`),
  ADD KEY idx_outbound_detail_batch (`batch_id`,`id`),
  ADD KEY idx_outbound_detail_batch_material (`batch_id`,`item_id`,`material_variant_id`),
  ADD KEY idx_outbound_detail_batch_product (`batch_id`,`product_id`),
  ADD KEY idx_outbound_detail_item (`item_id`,`id`),
  ADD KEY idx_outbound_detail_variant (`material_variant_id`,`item_id`),
  ADD KEY idx_outbound_detail_product (`product_id`,`id`),
  ADD KEY idx_outbound_detail_demand_batch (`demand_id`,`production_batch_id`),
  ADD KEY idx_outbound_detail_created_by (`created_by`),
  ADD KEY idx_outbound_detail_updated_by (`updated_by`),
  ADD KEY idx_outbound_detail_deleted_by (`deleted_by`),
  ADD KEY idx_outbound_detail_allocation (`allocation_id`,`id`),
  ADD KEY idx_outbound_detail_demand (`demand_id`,`id`),
  ADD KEY idx_outbound_detail_allocation_source (`allocation_id`,`demand_id`,`production_batch_id`,`item_id`,`batch_id`,`material_variant_id`),
  ADD CONSTRAINT chk_outbound_detail_identity CHECK ((item_id IS NOT NULL AND material_variant_id IS NOT NULL AND product_id IS NULL) OR (item_id IS NULL AND material_variant_id IS NULL AND product_id IS NOT NULL)),
  ADD CONSTRAINT chk_outbound_detail_quantity CHECK (outbound_number BETWEEN 1 AND 99999999),
  ADD CONSTRAINT chk_outbound_detail_line CHECK (line_no>0),
  ADD CONSTRAINT chk_outbound_detail_unit CHECK (CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(unit_snapshot,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0),
  ADD CONSTRAINT chk_outbound_detail_stock_status CHECK (stock_status='available'),
  ADD CONSTRAINT chk_outbound_detail_deletion CHECK ((is_deleted=0 AND deleted_by IS NULL AND deleted_at IS NULL) OR (is_deleted=1 AND source_type='other' AND deleted_by IS NOT NULL AND deleted_at IS NOT NULL)),
  ADD CONSTRAINT chk_outbound_detail_source CHECK ((source_type='production_material' AND item_id IS NOT NULL AND production_batch_id IS NOT NULL AND demand_id IS NOT NULL AND allocation_id IS NOT NULL) OR (source_type='other' AND production_batch_id IS NULL AND demand_id IS NULL AND allocation_id IS NULL));

ALTER TABLE inventory_transaction
  ADD UNIQUE KEY uk_inventory_transaction_idempotency (`idempotency_key`),
  ADD UNIQUE KEY uk_inventory_transaction_reversal (`reversal_of_transaction_id`),
  ADD UNIQUE KEY uk_inventory_transaction_original_posting (`original_posting_key`),
  ADD KEY idx_inventory_transaction_reference (`reference_type`,`reference_detail_id`,`id`),
  ADD KEY idx_inventory_transaction_stock (`item_id`,`batch_id`,`stock_status`,`created_at`),
  ADD KEY idx_inventory_transaction_product_stock (`product_id`,`batch_id`,`stock_status`,`created_at`),
  ADD KEY idx_inventory_transaction_group (`transaction_group_key`),
  ADD KEY idx_inventory_transaction_batch_status (`batch_id`,`stock_status`,`id`),
  ADD KEY idx_inventory_transaction_variant (`material_variant_id`,`item_id`),
  ADD KEY idx_inventory_transaction_batch_material (`batch_id`,`item_id`,`material_variant_id`),
  ADD KEY idx_inventory_transaction_batch_product (`batch_id`,`product_id`),
  ADD KEY idx_inventory_transaction_created_by (`created_by`),
  ADD KEY idx_inventory_transaction_inbound_material (`inbound_detail_ref`,`item_id`,`material_variant_id`,`batch_id`),
  ADD KEY idx_inventory_transaction_inbound_product (`inbound_detail_ref`,`product_id`,`batch_id`),
  ADD KEY idx_inventory_transaction_outbound_material (`outbound_detail_ref`,`item_id`,`material_variant_id`,`batch_id`),
  ADD KEY idx_inventory_transaction_outbound_product (`outbound_detail_ref`,`product_id`,`batch_id`),
  ADD KEY idx_inventory_transaction_stock_check_material (`stock_check_detail_ref`,`item_id`,`material_variant_id`,`batch_id`),
  ADD CONSTRAINT chk_inventory_transaction_identity CHECK ((item_id IS NOT NULL AND material_variant_id IS NOT NULL AND product_id IS NULL) OR (item_id IS NULL AND material_variant_id IS NULL AND product_id IS NOT NULL)),
  ADD CONSTRAINT chk_inventory_transaction_quantity CHECK (quantity<>0 AND quantity BETWEEN -99999999 AND 99999999),
  ADD CONSTRAINT chk_inventory_transaction_unit CHECK (CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(unit_snapshot,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0),
  ADD CONSTRAINT chk_inventory_transaction_idempotency CHECK (CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(idempotency_key,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0),
  ADD CONSTRAINT chk_inventory_transaction_reference CHECK (reference_type IN ('inbound_detail','outbound_detail','stock_check_detail','scrap','inspection_record','manual')),
  ADD CONSTRAINT chk_inventory_transaction_stock_status CHECK (stock_status IN ('available','pending_inspection','frozen','defective')),
  ADD CONSTRAINT chk_inventory_transaction_type CHECK (transaction_type IN ('purchase_inbound','production_inbound','outsourced_inbound','production_material_outbound','sales_outbound','material_return_inbound','scrap_outbound','stock_check_adjustment','status_transfer_in','status_transfer_out','other_inbound','other_outbound')),
  ADD CONSTRAINT chk_inventory_transaction_type_source CHECK (
  (transaction_type IN ('purchase_inbound','production_inbound','material_return_inbound','other_inbound') AND reference_type='inbound_detail' AND stock_status='available')
  OR (transaction_type IN ('production_material_outbound','other_outbound') AND reference_type='outbound_detail' AND stock_status='available')
  OR (transaction_type='stock_check_adjustment' AND reference_type='stock_check_detail' AND product_id IS NULL)
  OR (transaction_type IN ('outsourced_inbound','sales_outbound','scrap_outbound','status_transfer_in','status_transfer_out') AND reference_type IN ('scrap','inspection_record','manual') AND product_id IS NULL)
),
  ADD CONSTRAINT chk_inventory_transaction_direction CHECK (
  transaction_type='stock_check_adjustment'
  OR (transaction_type IN ('purchase_inbound','production_inbound','outsourced_inbound','material_return_inbound','status_transfer_in','other_inbound') AND ((reversal_of_transaction_id IS NULL AND quantity>0) OR (reversal_of_transaction_id IS NOT NULL AND quantity<0)))
  OR (transaction_type IN ('production_material_outbound','sales_outbound','scrap_outbound','status_transfer_out','other_outbound') AND ((reversal_of_transaction_id IS NULL AND quantity<0) OR (reversal_of_transaction_id IS NOT NULL AND quantity>0)))
),
  ADD CONSTRAINT chk_inventory_transaction_finished_scope CHECK (product_id IS NULL OR (transaction_type IN ('production_inbound','other_inbound','other_outbound') AND stock_status='available' AND reversal_of_transaction_id IS NULL AND transaction_group_key IS NULL)),
  ADD CONSTRAINT chk_inventory_transaction_other_original CHECK (transaction_type NOT IN ('other_inbound','other_outbound') OR reversal_of_transaction_id IS NULL),
  ADD CONSTRAINT chk_inventory_transaction_transfer_group CHECK (transaction_type NOT IN ('status_transfer_in','status_transfer_out') OR (transaction_group_key IS NOT NULL AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(transaction_group_key,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0));

ALTER TABLE stock_check_detail ADD UNIQUE KEY uk_stock_check_detail_material_reference (id,item_id,material_variant_id,batch_id);

ALTER TABLE inbound_order
  ADD CONSTRAINT fk_inbound_order_work_order FOREIGN KEY (`work_order_id`) REFERENCES work_orders (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_order_batch_work_order FOREIGN KEY (`production_batch_id`,`work_order_id`) REFERENCES production_batches (`id`,`work_order_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_order_operator_id FOREIGN KEY (`operator_id`) REFERENCES users (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_order_cancelled_by FOREIGN KEY (`cancelled_by`) REFERENCES users (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_order_created_by FOREIGN KEY (`created_by`) REFERENCES users (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_order_updated_by FOREIGN KEY (`updated_by`) REFERENCES users (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_order_product FOREIGN KEY (`product_id`) REFERENCES products (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_order_batch_product FOREIGN KEY (`production_batch_id`,`product_id`) REFERENCES production_batches (`id`,`product_id`) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE inbound_detail
  ADD CONSTRAINT fk_inbound_detail_order_source FOREIGN KEY (`inbound_id`,`source_type`) REFERENCES inbound_order (`id`,`source_type`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_detail_order_batch FOREIGN KEY (`inbound_id`,`production_batch_id`) REFERENCES inbound_order (`id`,`production_batch_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_detail_demand_batch FOREIGN KEY (`demand_id`,`production_batch_id`) REFERENCES production_item_demand (`id`,`production_batch_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_detail_item FOREIGN KEY (`item_id`) REFERENCES materials (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_detail_variant FOREIGN KEY (`material_variant_id`,`item_id`) REFERENCES material_variants (`id`,`material_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_detail_product FOREIGN KEY (`product_id`) REFERENCES products (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_detail_batch_material FOREIGN KEY (`batch_id`,`item_id`,`material_variant_id`) REFERENCES item_batch (`id`,`item_id`,`material_variant_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_detail_batch_product FOREIGN KEY (`batch_id`,`product_id`) REFERENCES item_batch (`id`,`product_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_detail_created_by FOREIGN KEY (`created_by`) REFERENCES users (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_detail_updated_by FOREIGN KEY (`updated_by`) REFERENCES users (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_detail_deleted_by FOREIGN KEY (`deleted_by`) REFERENCES users (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_detail_return_allocation FOREIGN KEY (`return_allocation_id`,`demand_id`,`production_batch_id`,`item_id`,`batch_id`,`material_variant_id`) REFERENCES production_item_allocation (`id`,`demand_id`,`production_batch_id`,`item_id`,`batch_id`,`material_variant_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_detail_procurement_material FOREIGN KEY (`procurement_receipt_line_id`,`item_id`,`material_variant_id`) REFERENCES procurement_receipt_line (`id`,`item_id`,`material_variant_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_detail_procurement_revision FOREIGN KEY (`procurement_receipt_revision_id`,`procurement_receipt_line_id`) REFERENCES procurement_receipt_revision (`id`,`receipt_line_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_detail_procurement_inspection FOREIGN KEY (`procurement_inspection_id`,`procurement_receipt_line_id`) REFERENCES quality_inspection_record (`id`,`receipt_line_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_detail_procurement_allocation FOREIGN KEY (`procurement_allocation_id`,`procurement_receipt_line_id`) REFERENCES procurement_receipt_allocation (`id`,`receipt_line_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inbound_detail_output_allocation FOREIGN KEY (`production_output_allocation_id`) REFERENCES production_output_allocation (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE outbound_order
  ADD CONSTRAINT fk_outbound_order_work_order FOREIGN KEY (`work_order_id`) REFERENCES work_orders (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_outbound_order_batch_work_order FOREIGN KEY (`production_batch_id`,`work_order_id`) REFERENCES production_batches (`id`,`work_order_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_outbound_order_operator_id FOREIGN KEY (`operator_id`) REFERENCES users (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_outbound_order_cancelled_by FOREIGN KEY (`cancelled_by`) REFERENCES users (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_outbound_order_created_by FOREIGN KEY (`created_by`) REFERENCES users (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_outbound_order_updated_by FOREIGN KEY (`updated_by`) REFERENCES users (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE outbound_detail
  ADD CONSTRAINT fk_outbound_detail_order_source FOREIGN KEY (`outbound_id`,`source_type`) REFERENCES outbound_order (`id`,`source_type`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_outbound_detail_order_batch FOREIGN KEY (`outbound_id`,`production_batch_id`) REFERENCES outbound_order (`id`,`production_batch_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_outbound_detail_demand_batch FOREIGN KEY (`demand_id`,`production_batch_id`) REFERENCES production_item_demand (`id`,`production_batch_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_outbound_detail_item FOREIGN KEY (`item_id`) REFERENCES materials (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_outbound_detail_variant FOREIGN KEY (`material_variant_id`,`item_id`) REFERENCES material_variants (`id`,`material_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_outbound_detail_product FOREIGN KEY (`product_id`) REFERENCES products (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_outbound_detail_batch_material FOREIGN KEY (`batch_id`,`item_id`,`material_variant_id`) REFERENCES item_batch (`id`,`item_id`,`material_variant_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_outbound_detail_batch_product FOREIGN KEY (`batch_id`,`product_id`) REFERENCES item_batch (`id`,`product_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_outbound_detail_created_by FOREIGN KEY (`created_by`) REFERENCES users (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_outbound_detail_updated_by FOREIGN KEY (`updated_by`) REFERENCES users (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_outbound_detail_deleted_by FOREIGN KEY (`deleted_by`) REFERENCES users (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_outbound_detail_allocation FOREIGN KEY (`allocation_id`,`demand_id`,`production_batch_id`,`item_id`,`batch_id`,`material_variant_id`) REFERENCES production_item_allocation (`id`,`demand_id`,`production_batch_id`,`item_id`,`batch_id`,`material_variant_id`) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE inventory_transaction
  ADD CONSTRAINT fk_inventory_transaction_created_by FOREIGN KEY (`created_by`) REFERENCES users (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_transaction_item FOREIGN KEY (`item_id`) REFERENCES materials (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_transaction_variant FOREIGN KEY (`material_variant_id`,`item_id`) REFERENCES material_variants (`id`,`material_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_transaction_product FOREIGN KEY (`product_id`) REFERENCES products (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_transaction_batch_material FOREIGN KEY (`batch_id`,`item_id`,`material_variant_id`) REFERENCES item_batch (`id`,`item_id`,`material_variant_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_transaction_batch_product FOREIGN KEY (`batch_id`,`product_id`) REFERENCES item_batch (`id`,`product_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_transaction_reversal FOREIGN KEY (`reversal_of_transaction_id`) REFERENCES inventory_transaction (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_transaction_inbound_detail FOREIGN KEY (`inbound_detail_ref`) REFERENCES inbound_detail (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_transaction_inbound_material FOREIGN KEY (`inbound_detail_ref`,`item_id`,`material_variant_id`,`batch_id`) REFERENCES inbound_detail (`id`,`item_id`,`material_variant_id`,`batch_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_transaction_inbound_product FOREIGN KEY (`inbound_detail_ref`,`product_id`,`batch_id`) REFERENCES inbound_detail (`id`,`product_id`,`batch_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_transaction_outbound_detail FOREIGN KEY (`outbound_detail_ref`) REFERENCES outbound_detail (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_transaction_outbound_material FOREIGN KEY (`outbound_detail_ref`,`item_id`,`material_variant_id`,`batch_id`) REFERENCES outbound_detail (`id`,`item_id`,`material_variant_id`,`batch_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_transaction_outbound_product FOREIGN KEY (`outbound_detail_ref`,`product_id`,`batch_id`) REFERENCES outbound_detail (`id`,`product_id`,`batch_id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_transaction_stock_check_detail FOREIGN KEY (`stock_check_detail_ref`) REFERENCES stock_check_detail (`id`) ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_transaction_stock_check_material FOREIGN KEY (`stock_check_detail_ref`,`item_id`,`material_variant_id`,`batch_id`) REFERENCES stock_check_detail (`id`,`item_id`,`material_variant_id`,`batch_id`) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE item_batch ADD CONSTRAINT chk_item_batch_snapshots CHECK (
  CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(item_code_snapshot,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0 AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(unit_snapshot,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0 AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(batch_code,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0
  AND (material_variant_code_snapshot IS NULL OR CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(material_variant_code_snapshot,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0)
);

DROP TABLE return_detail;
DROP TABLE return_order;

-- Lifecycle guards use only writable reference fields, never NEW generated columns.

CREATE TRIGGER trg_inbound_order_insert_guard BEFORE INSERT ON inbound_order FOR EACH ROW
BEGIN

  IF NEW.status<>'pending' OR NEW.version<>0 OR NEW.created_by IS NULL OR NEW.updated_by IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory order must start pending with version zero and complete creation audit';
  END IF;

END;

CREATE TRIGGER trg_inbound_order_update_guard BEFORE UPDATE ON inbound_order FOR EACH ROW
BEGIN

  DECLARE total_details BIGINT DEFAULT 0;
  DECLARE matched_details BIGINT DEFAULT 0;
  IF NOT(COALESCE(@company_inventory_test_cleanup,0)=1 AND (RIGHT(DATABASE(),5)='_test' OR RIGHT(DATABASE(),3)='_ci')) THEN
    IF OLD.status<>'pending' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Terminal inventory order is immutable'; END IF;
    IF NEW.version<>OLD.version+1 OR NOT(NEW.id <=> OLD.id)
      OR NOT(NEW.inbound_no <=> OLD.inbound_no)
      OR NOT(NEW.source_type <=> OLD.source_type)
      OR NOT(NEW.work_order_id <=> OLD.work_order_id)
      OR NOT(NEW.production_batch_id <=> OLD.production_batch_id)
      OR NOT(NEW.product_id <=> OLD.product_id)
      OR NOT(NEW.created_by <=> OLD.created_by)
      OR NOT(NEW.created_at <=> OLD.created_at) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory order identity is immutable and every command must advance version once';
    END IF;
    IF (NOT(NEW.reason <=> OLD.reason) OR NOT(NEW.remark <=> OLD.remark)) AND NOT(OLD.source_type='other' AND NEW.status='pending') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Only an unposted other draft may edit its reason or remark';
    END IF;
    IF NEW.status='completed' THEN
      SELECT COUNT(*) INTO total_details FROM inbound_detail WHERE inbound_id=OLD.id AND is_deleted=0;
      SELECT COUNT(*) INTO matched_details FROM inbound_detail d JOIN item_batch b ON b.id=d.batch_id
      JOIN inventory_transaction t ON t.reference_type='inbound_detail' AND t.reference_detail_id=d.id
        AND t.reversal_of_transaction_id IS NULL AND t.transaction_type=(CASE OLD.source_type WHEN 'purchased' THEN 'purchase_inbound' WHEN 'finished_product' THEN 'production_inbound' WHEN 'return_inbound' THEN 'material_return_inbound' WHEN 'other' THEN 'other_inbound' END)
        AND t.item_id <=> d.item_id AND t.material_variant_id <=> d.material_variant_id AND t.product_id <=> d.product_id
        AND t.batch_id=d.batch_id AND t.quantity=d.inbound_number
        AND t.unit_snapshot=d.unit_snapshot AND t.stock_status=d.stock_status AND t.created_by=NEW.operator_id
      WHERE d.inbound_id=OLD.id AND d.is_deleted=0 AND d.source_type=OLD.source_type
        AND b.item_id <=> d.item_id AND b.material_variant_id <=> d.material_variant_id AND b.product_id <=> d.product_id
        AND b.unit_snapshot=d.unit_snapshot AND (OLD.source_type='return_inbound' OR b.batch_status='available');
      IF total_details=0 OR matched_details<>total_details OR (OLD.source_type='other' AND total_details>50)
        OR EXISTS(SELECT 1 FROM inbound_detail d JOIN inventory_transaction t ON t.reference_type='inbound_detail' AND t.reference_detail_id=d.id WHERE d.inbound_id=OLD.id AND d.is_deleted=1) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Completion requires every active detail to have one matching original posting';
      END IF;
    ELSEIF NEW.status='cancelled' THEN
      IF EXISTS(SELECT 1 FROM inbound_detail d JOIN inventory_transaction t ON t.reference_type='inbound_detail' AND t.reference_detail_id=d.id WHERE d.inbound_id=OLD.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A posted inventory order cannot be cancelled'; END IF;
    ELSEIF NEW.status='pending' THEN
      IF OLD.source_type<>'other' OR EXISTS(SELECT 1 FROM inbound_detail d JOIN inventory_transaction t ON t.reference_type='inbound_detail' AND t.reference_detail_id=d.id WHERE d.inbound_id=OLD.id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Only an unposted other draft may be saved';
      END IF;
      SELECT COUNT(*) INTO total_details FROM inbound_detail WHERE inbound_id=OLD.id AND is_deleted=0;
      IF total_details NOT BETWEEN 1 AND 50 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='An other draft must contain one to fifty active details'; END IF;
    ELSE
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory order state transition is not allowed';
    END IF;
  END IF;

END;

CREATE TRIGGER trg_inbound_order_delete_guard BEFORE DELETE ON inbound_order FOR EACH ROW
BEGIN

  IF NOT(COALESCE(@company_inventory_test_cleanup,0)=1 AND (RIGHT(DATABASE(),5)='_test' OR RIGHT(DATABASE(),3)='_ci')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory orders cannot be physically deleted'; END IF;

END;

CREATE TRIGGER trg_outbound_order_insert_guard BEFORE INSERT ON outbound_order FOR EACH ROW
BEGIN

  IF NEW.status<>'pending_picking' OR NEW.version<>0 OR NEW.created_by IS NULL OR NEW.updated_by IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory order must start pending with version zero and complete creation audit';
  END IF;

END;

CREATE TRIGGER trg_outbound_order_update_guard BEFORE UPDATE ON outbound_order FOR EACH ROW
BEGIN

  DECLARE total_details BIGINT DEFAULT 0;
  DECLARE matched_details BIGINT DEFAULT 0;
  IF NOT(COALESCE(@company_inventory_test_cleanup,0)=1 AND (RIGHT(DATABASE(),5)='_test' OR RIGHT(DATABASE(),3)='_ci')) THEN
    IF OLD.status<>'pending_picking' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Terminal inventory order is immutable'; END IF;
    IF NEW.version<>OLD.version+1 OR NOT(NEW.id <=> OLD.id)
      OR NOT(NEW.outbound_no <=> OLD.outbound_no)
      OR NOT(NEW.source_type <=> OLD.source_type)
      OR NOT(NEW.production_batch_id <=> OLD.production_batch_id)
      OR NOT(NEW.work_order_id <=> OLD.work_order_id)
      OR NOT(NEW.created_by <=> OLD.created_by)
      OR NOT(NEW.created_at <=> OLD.created_at) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory order identity is immutable and every command must advance version once';
    END IF;
    IF (NOT(NEW.reason <=> OLD.reason) OR NOT(NEW.remark <=> OLD.remark)) AND NOT(OLD.source_type='other' AND NEW.status='pending_picking') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Only an unposted other draft may edit its reason or remark';
    END IF;
    IF NEW.status='completed' THEN
      SELECT COUNT(*) INTO total_details FROM outbound_detail WHERE outbound_id=OLD.id AND is_deleted=0;
      SELECT COUNT(*) INTO matched_details FROM outbound_detail d JOIN item_batch b ON b.id=d.batch_id
      JOIN inventory_transaction t ON t.reference_type='outbound_detail' AND t.reference_detail_id=d.id
        AND t.reversal_of_transaction_id IS NULL AND t.transaction_type=(CASE OLD.source_type WHEN 'production_material' THEN 'production_material_outbound' WHEN 'other' THEN 'other_outbound' END)
        AND t.item_id <=> d.item_id AND t.material_variant_id <=> d.material_variant_id AND t.product_id <=> d.product_id
        AND t.batch_id=d.batch_id AND t.quantity=-d.outbound_number
        AND t.unit_snapshot=d.unit_snapshot AND t.stock_status=d.stock_status AND t.created_by=NEW.operator_id
      WHERE d.outbound_id=OLD.id AND d.is_deleted=0 AND d.source_type=OLD.source_type
        AND b.item_id <=> d.item_id AND b.material_variant_id <=> d.material_variant_id AND b.product_id <=> d.product_id
        AND b.unit_snapshot=d.unit_snapshot AND b.batch_status='available';
      IF total_details=0 OR matched_details<>total_details OR (OLD.source_type='other' AND total_details>50)
        OR EXISTS(SELECT 1 FROM outbound_detail d JOIN inventory_transaction t ON t.reference_type='outbound_detail' AND t.reference_detail_id=d.id WHERE d.outbound_id=OLD.id AND d.is_deleted=1) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Completion requires every active detail to have one matching original posting';
      END IF;
    ELSEIF NEW.status='cancelled' THEN
      IF EXISTS(SELECT 1 FROM outbound_detail d JOIN inventory_transaction t ON t.reference_type='outbound_detail' AND t.reference_detail_id=d.id WHERE d.outbound_id=OLD.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A posted inventory order cannot be cancelled'; END IF;
    ELSEIF NEW.status='pending_picking' THEN
      IF OLD.source_type<>'other' OR EXISTS(SELECT 1 FROM outbound_detail d JOIN inventory_transaction t ON t.reference_type='outbound_detail' AND t.reference_detail_id=d.id WHERE d.outbound_id=OLD.id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Only an unposted other draft may be saved';
      END IF;
      SELECT COUNT(*) INTO total_details FROM outbound_detail WHERE outbound_id=OLD.id AND is_deleted=0;
      IF total_details NOT BETWEEN 1 AND 50 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='An other draft must contain one to fifty active details'; END IF;
    ELSE
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory order state transition is not allowed';
    END IF;
  END IF;

END;

CREATE TRIGGER trg_outbound_order_delete_guard BEFORE DELETE ON outbound_order FOR EACH ROW
BEGIN

  IF NOT(COALESCE(@company_inventory_test_cleanup,0)=1 AND (RIGHT(DATABASE(),5)='_test' OR RIGHT(DATABASE(),3)='_ci')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory orders cannot be physically deleted'; END IF;

END;

CREATE TRIGGER trg_inbound_detail_insert_guard BEFORE INSERT ON inbound_detail FOR EACH ROW
BEGIN

  DECLARE parent_batch BIGINT UNSIGNED;
  DECLARE parent_work_order BIGINT UNSIGNED;
  DECLARE parent_product BIGINT UNSIGNED;
  DECLARE parent_source VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  DECLARE parent_status VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

  DECLARE next_line BIGINT DEFAULT 1;
  
  SELECT source_type,status,production_batch_id,work_order_id,product_id
  INTO parent_source,parent_status,parent_batch,parent_work_order,parent_product
  FROM inbound_order WHERE id=NEW.inbound_id FOR UPDATE;
  IF parent_source IS NULL OR parent_status<>'pending' OR NOT(NEW.source_type <=> parent_source)
    OR EXISTS(SELECT 1 FROM inbound_detail d JOIN inventory_transaction t ON t.reference_type='inbound_detail' AND t.reference_detail_id=d.id WHERE d.inbound_id=NEW.inbound_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound detail requires its matching unposted pending order';
  END IF;

  IF NEW.is_deleted<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A new inbound detail cannot start deleted'; END IF;
  SELECT COALESCE(MAX(line_no),0)+1 INTO next_line FROM inbound_detail WHERE inbound_id=NEW.inbound_id;
  IF NEW.line_no<>next_line THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound line numbers must append and cannot be reused'; END IF;
  IF NEW.source_type='other' AND NEW.target_mode='new' AND NEW.batch_id IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='An other new-batch draft stores intent until confirmation';
  END IF;
  
  IF NEW.batch_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM item_batch b WHERE b.id=NEW.batch_id
      AND b.item_id <=> NEW.item_id AND b.material_variant_id <=> NEW.material_variant_id AND b.product_id <=> NEW.product_id
      AND b.unit_snapshot=NEW.unit_snapshot
      AND (NEW.source_type='return_inbound' OR b.batch_status='available')
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound target batch must have the exact identity and unit'; END IF;
  IF NEW.target_mode='new' AND NEW.is_deleted=0 AND EXISTS(
    SELECT 1 FROM inbound_detail d WHERE d.inbound_id=NEW.inbound_id AND d.id<>NEW.id
      AND d.is_deleted=0 AND d.target_mode='new' AND d.new_batch_key=NEW.new_batch_key
      AND (NOT(d.item_id <=> NEW.item_id) OR NOT(d.material_variant_id <=> NEW.material_variant_id)
        OR NOT(d.product_id <=> NEW.product_id) OR NOT(d.unit_snapshot <=> NEW.unit_snapshot)
        OR NOT(d.item_code_snapshot <=> NEW.item_code_snapshot)
        OR (d.batch_id IS NOT NULL AND NEW.batch_id IS NOT NULL AND d.batch_id<>NEW.batch_id))
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A new batch group must share one exact identity unit code and resolved batch'; END IF;

  
  IF NEW.source_type='purchased' AND NOT EXISTS(
    SELECT 1 FROM procurement_receipt_allocation a
    JOIN procurement_receipt_acceptance h ON h.id=a.acceptance_id AND h.receipt_line_id=a.receipt_line_id AND h.round_id=a.round_id
    JOIN procurement_receipt_round r ON r.id=a.round_id AND r.receipt_line_id=a.receipt_line_id
    JOIN procurement_receipt_line l ON l.id=a.receipt_line_id
    JOIN procurement_order_line assigned_line ON assigned_line.id=a.purchase_order_line_id
    JOIN procurement_order_line original_line ON original_line.id=l.purchase_order_line_id
    JOIN quality_inspection_record q ON q.id=h.inspection_record_id
    WHERE a.id=NEW.procurement_allocation_id AND a.disposition='inbound' AND a.termination_reason IS NULL
      AND l.id=NEW.procurement_receipt_line_id AND l.item_id=NEW.item_id AND l.material_variant_id=NEW.material_variant_id
      AND l.current_round_id=a.round_id AND r.status='finalized' AND r.inspection_id=NEW.procurement_inspection_id
      AND l.current_receipt_revision_id=NEW.procurement_receipt_revision_id
      AND h.after_receipt_revision_id=NEW.procurement_receipt_revision_id AND h.inspection_record_id=NEW.procurement_inspection_id
      AND q.release_decision='released' AND assigned_line.item_id=NEW.item_id AND assigned_line.material_variant_id=NEW.material_variant_id
      AND assigned_line.supplier_id=original_line.supplier_id AND assigned_line.unit_snapshot=NEW.unit_snapshot
      AND assigned_line.item_code_snapshot=NEW.item_code_snapshot
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Purchase inbound requires a matching current released allocation and acceptance basis'; END IF;
  IF NEW.source_type='finished_product' AND (NOT(NEW.product_id <=> parent_product) OR NOT EXISTS(
    SELECT 1 FROM production_output_allocation a JOIN production_output_revision r ON r.id=a.revision_id
    JOIN production_output_round round ON round.id=a.round_id JOIN production_batch_closeout c ON c.id=a.closeout_id
    JOIN production_batches pb ON pb.id=r.production_batch_id JOIN work_orders wo ON wo.id=r.work_order_id
    JOIN approval_instances approval ON approval.id=r.approval_instance_id
    JOIN quality_inspection_record q ON q.id=r.inspection_record_id
    WHERE a.id=NEW.production_output_allocation_id AND r.production_batch_id=parent_batch AND r.work_order_id=parent_work_order
      AND r.product_id=NEW.product_id AND c.current_revision_id=r.id AND c.current_round_id=round.id
      AND c.pending_approval_id IS NULL AND round.status='finalized' AND pb.status IN ('completed','terminated')
      AND approval.status='approved' AND q.release_decision='released'
      AND wo.unit_snapshot=NEW.unit_snapshot AND wo.product_code_snapshot=NEW.item_code_snapshot
  )) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished inbound requires the matching current approved output allocation'; END IF;
  IF NEW.source_type='return_inbound' AND NOT EXISTS(
    SELECT 1 FROM production_item_allocation a JOIN production_item_demand d ON d.id=a.demand_id
    WHERE a.id=NEW.return_allocation_id AND a.demand_id=NEW.demand_id AND a.production_batch_id=parent_batch
      AND a.production_batch_id=NEW.production_batch_id AND a.item_id=NEW.item_id AND a.material_variant_id=NEW.material_variant_id
      AND a.batch_id=NEW.batch_id AND a.unit_snapshot=NEW.unit_snapshot AND d.item_code_snapshot=NEW.item_code_snapshot
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Material return requires the original allocation batch identity and unit'; END IF;


END;

CREATE TRIGGER trg_inbound_detail_update_guard BEFORE UPDATE ON inbound_detail FOR EACH ROW
BEGIN

  DECLARE parent_batch BIGINT UNSIGNED;
  DECLARE parent_work_order BIGINT UNSIGNED;
  DECLARE parent_product BIGINT UNSIGNED;
  DECLARE parent_source VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  DECLARE parent_status VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

  DECLARE resolving_batch TINYINT DEFAULT 0;
  IF NOT(COALESCE(@company_inventory_test_cleanup,0)=1 AND (RIGHT(DATABASE(),5)='_test' OR RIGHT(DATABASE(),3)='_ci')) THEN
    
  SELECT source_type,status,production_batch_id,work_order_id,product_id
  INTO parent_source,parent_status,parent_batch,parent_work_order,parent_product
  FROM inbound_order WHERE id=NEW.inbound_id FOR UPDATE;
  IF parent_source IS NULL OR parent_status<>'pending' OR NOT(NEW.source_type <=> parent_source)
    OR EXISTS(SELECT 1 FROM inbound_detail d JOIN inventory_transaction t ON t.reference_type='inbound_detail' AND t.reference_detail_id=d.id WHERE d.inbound_id=NEW.inbound_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound detail requires its matching unposted pending order';
  END IF;

    IF OLD.is_deleted=1 OR NOT(NEW.id <=> OLD.id) OR NOT(NEW.inbound_id <=> OLD.inbound_id) OR NOT(NEW.line_no <=> OLD.line_no) OR NOT(NEW.source_type <=> OLD.source_type) OR NOT(NEW.created_by <=> OLD.created_by) OR NOT(NEW.created_at <=> OLD.created_at) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound detail creation identity and deleted history are immutable';
    END IF;
    SET resolving_batch=OLD.target_mode='new' AND OLD.batch_id IS NULL AND NEW.batch_id IS NOT NULL
      AND NEW.id <=> OLD.id
      AND NEW.inbound_id <=> OLD.inbound_id
      AND NEW.line_no <=> OLD.line_no
      AND NEW.source_type <=> OLD.source_type
      AND NEW.item_id <=> OLD.item_id
      AND NEW.material_variant_id <=> OLD.material_variant_id
      AND NEW.product_id <=> OLD.product_id
      AND NEW.target_mode <=> OLD.target_mode
      AND NEW.new_batch_key <=> OLD.new_batch_key
      AND NEW.inbound_number <=> OLD.inbound_number
      AND NEW.unit_snapshot <=> OLD.unit_snapshot
      AND NEW.item_code_snapshot <=> OLD.item_code_snapshot
      AND NEW.stock_status <=> OLD.stock_status
      AND NEW.procurement_receipt_line_id <=> OLD.procurement_receipt_line_id
      AND NEW.procurement_receipt_revision_id <=> OLD.procurement_receipt_revision_id
      AND NEW.procurement_inspection_id <=> OLD.procurement_inspection_id
      AND NEW.procurement_allocation_id <=> OLD.procurement_allocation_id
      AND NEW.supplier_name_snapshot <=> OLD.supplier_name_snapshot
      AND NEW.production_output_allocation_id <=> OLD.production_output_allocation_id
      AND NEW.production_batch_id <=> OLD.production_batch_id
      AND NEW.demand_id <=> OLD.demand_id
      AND NEW.return_allocation_id <=> OLD.return_allocation_id
      AND NEW.remark <=> OLD.remark
      AND NEW.created_by <=> OLD.created_by
      AND NEW.created_at <=> OLD.created_at
      AND NEW.is_deleted <=> OLD.is_deleted
      AND NEW.deleted_by <=> OLD.deleted_by
      AND NEW.deleted_at <=> OLD.deleted_at;
    IF OLD.source_type<>'other' AND resolving_batch<>1 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Source inbound details only permit resolving a new target batch';
    END IF;
    IF NEW.target_mode='new' AND NEW.batch_id IS NOT NULL AND resolving_batch<>1 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A real new target can only be assigned once during confirmation';
    END IF;
    IF NEW.is_deleted=1 AND (NOT(NEW.id <=> OLD.id)
      OR NOT(NEW.inbound_id <=> OLD.inbound_id)
      OR NOT(NEW.line_no <=> OLD.line_no)
      OR NOT(NEW.source_type <=> OLD.source_type)
      OR NOT(NEW.item_id <=> OLD.item_id)
      OR NOT(NEW.material_variant_id <=> OLD.material_variant_id)
      OR NOT(NEW.product_id <=> OLD.product_id)
      OR NOT(NEW.batch_id <=> OLD.batch_id)
      OR NOT(NEW.target_mode <=> OLD.target_mode)
      OR NOT(NEW.new_batch_key <=> OLD.new_batch_key)
      OR NOT(NEW.inbound_number <=> OLD.inbound_number)
      OR NOT(NEW.unit_snapshot <=> OLD.unit_snapshot)
      OR NOT(NEW.item_code_snapshot <=> OLD.item_code_snapshot)
      OR NOT(NEW.stock_status <=> OLD.stock_status)
      OR NOT(NEW.procurement_receipt_line_id <=> OLD.procurement_receipt_line_id)
      OR NOT(NEW.procurement_receipt_revision_id <=> OLD.procurement_receipt_revision_id)
      OR NOT(NEW.procurement_inspection_id <=> OLD.procurement_inspection_id)
      OR NOT(NEW.procurement_allocation_id <=> OLD.procurement_allocation_id)
      OR NOT(NEW.supplier_name_snapshot <=> OLD.supplier_name_snapshot)
      OR NOT(NEW.production_output_allocation_id <=> OLD.production_output_allocation_id)
      OR NOT(NEW.production_batch_id <=> OLD.production_batch_id)
      OR NOT(NEW.demand_id <=> OLD.demand_id)
      OR NOT(NEW.return_allocation_id <=> OLD.return_allocation_id)
      OR NOT(NEW.remark <=> OLD.remark)
      OR NOT(NEW.created_by <=> OLD.created_by)
      OR NOT(NEW.created_at <=> OLD.created_at)) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Soft deletion preserves the complete inbound business row';
    END IF;
    
  IF NEW.batch_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM item_batch b WHERE b.id=NEW.batch_id
      AND b.item_id <=> NEW.item_id AND b.material_variant_id <=> NEW.material_variant_id AND b.product_id <=> NEW.product_id
      AND b.unit_snapshot=NEW.unit_snapshot
      AND (NEW.source_type='return_inbound' OR b.batch_status='available')
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound target batch must have the exact identity and unit'; END IF;
  IF NEW.target_mode='new' AND NEW.is_deleted=0 AND EXISTS(
    SELECT 1 FROM inbound_detail d WHERE d.inbound_id=NEW.inbound_id AND d.id<>NEW.id
      AND d.is_deleted=0 AND d.target_mode='new' AND d.new_batch_key=NEW.new_batch_key
      AND (NOT(d.item_id <=> NEW.item_id) OR NOT(d.material_variant_id <=> NEW.material_variant_id)
        OR NOT(d.product_id <=> NEW.product_id) OR NOT(d.unit_snapshot <=> NEW.unit_snapshot)
        OR NOT(d.item_code_snapshot <=> NEW.item_code_snapshot)
        OR (d.batch_id IS NOT NULL AND NEW.batch_id IS NOT NULL AND d.batch_id<>NEW.batch_id))
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A new batch group must share one exact identity unit code and resolved batch'; END IF;

    
  IF NEW.source_type='purchased' AND NOT EXISTS(
    SELECT 1 FROM procurement_receipt_allocation a
    JOIN procurement_receipt_acceptance h ON h.id=a.acceptance_id AND h.receipt_line_id=a.receipt_line_id AND h.round_id=a.round_id
    JOIN procurement_receipt_round r ON r.id=a.round_id AND r.receipt_line_id=a.receipt_line_id
    JOIN procurement_receipt_line l ON l.id=a.receipt_line_id
    JOIN procurement_order_line assigned_line ON assigned_line.id=a.purchase_order_line_id
    JOIN procurement_order_line original_line ON original_line.id=l.purchase_order_line_id
    JOIN quality_inspection_record q ON q.id=h.inspection_record_id
    WHERE a.id=NEW.procurement_allocation_id AND a.disposition='inbound' AND a.termination_reason IS NULL
      AND l.id=NEW.procurement_receipt_line_id AND l.item_id=NEW.item_id AND l.material_variant_id=NEW.material_variant_id
      AND l.current_round_id=a.round_id AND r.status='finalized' AND r.inspection_id=NEW.procurement_inspection_id
      AND l.current_receipt_revision_id=NEW.procurement_receipt_revision_id
      AND h.after_receipt_revision_id=NEW.procurement_receipt_revision_id AND h.inspection_record_id=NEW.procurement_inspection_id
      AND q.release_decision='released' AND assigned_line.item_id=NEW.item_id AND assigned_line.material_variant_id=NEW.material_variant_id
      AND assigned_line.supplier_id=original_line.supplier_id AND assigned_line.unit_snapshot=NEW.unit_snapshot
      AND assigned_line.item_code_snapshot=NEW.item_code_snapshot
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Purchase inbound requires a matching current released allocation and acceptance basis'; END IF;
  IF NEW.source_type='finished_product' AND (NOT(NEW.product_id <=> parent_product) OR NOT EXISTS(
    SELECT 1 FROM production_output_allocation a JOIN production_output_revision r ON r.id=a.revision_id
    JOIN production_output_round round ON round.id=a.round_id JOIN production_batch_closeout c ON c.id=a.closeout_id
    JOIN production_batches pb ON pb.id=r.production_batch_id JOIN work_orders wo ON wo.id=r.work_order_id
    JOIN approval_instances approval ON approval.id=r.approval_instance_id
    JOIN quality_inspection_record q ON q.id=r.inspection_record_id
    WHERE a.id=NEW.production_output_allocation_id AND r.production_batch_id=parent_batch AND r.work_order_id=parent_work_order
      AND r.product_id=NEW.product_id AND c.current_revision_id=r.id AND c.current_round_id=round.id
      AND c.pending_approval_id IS NULL AND round.status='finalized' AND pb.status IN ('completed','terminated')
      AND approval.status='approved' AND q.release_decision='released'
      AND wo.unit_snapshot=NEW.unit_snapshot AND wo.product_code_snapshot=NEW.item_code_snapshot
  )) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished inbound requires the matching current approved output allocation'; END IF;
  IF NEW.source_type='return_inbound' AND NOT EXISTS(
    SELECT 1 FROM production_item_allocation a JOIN production_item_demand d ON d.id=a.demand_id
    WHERE a.id=NEW.return_allocation_id AND a.demand_id=NEW.demand_id AND a.production_batch_id=parent_batch
      AND a.production_batch_id=NEW.production_batch_id AND a.item_id=NEW.item_id AND a.material_variant_id=NEW.material_variant_id
      AND a.batch_id=NEW.batch_id AND a.unit_snapshot=NEW.unit_snapshot AND d.item_code_snapshot=NEW.item_code_snapshot
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Material return requires the original allocation batch identity and unit'; END IF;

  END IF;

END;

CREATE TRIGGER trg_inbound_detail_delete_guard BEFORE DELETE ON inbound_detail FOR EACH ROW
BEGIN

  IF NOT(COALESCE(@company_inventory_test_cleanup,0)=1 AND (RIGHT(DATABASE(),5)='_test' OR RIGHT(DATABASE(),3)='_ci')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound details cannot be physically deleted'; END IF;

END;

CREATE TRIGGER trg_outbound_detail_insert_guard BEFORE INSERT ON outbound_detail FOR EACH ROW
BEGIN

  DECLARE parent_batch BIGINT UNSIGNED;
  DECLARE parent_source VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  DECLARE parent_status VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

  DECLARE next_line BIGINT DEFAULT 1;
  
  SELECT source_type,status,production_batch_id INTO parent_source,parent_status,parent_batch
  FROM outbound_order WHERE id=NEW.outbound_id FOR UPDATE;
  IF parent_source IS NULL OR parent_status<>'pending_picking' OR NOT(NEW.source_type <=> parent_source)
    OR EXISTS(SELECT 1 FROM outbound_detail d JOIN inventory_transaction t ON t.reference_type='outbound_detail' AND t.reference_detail_id=d.id WHERE d.outbound_id=NEW.outbound_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Outbound detail requires its matching unposted pending order';
  END IF;

  IF NEW.is_deleted<>0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A new outbound detail cannot start deleted'; END IF;
  SELECT COALESCE(MAX(line_no),0)+1 INTO next_line FROM outbound_detail WHERE outbound_id=NEW.outbound_id;
  IF NEW.line_no<>next_line THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Outbound line numbers must append and cannot be reused'; END IF;
  
  IF NOT EXISTS(SELECT 1 FROM item_batch b WHERE b.id=NEW.batch_id
    AND b.item_id <=> NEW.item_id AND b.material_variant_id <=> NEW.material_variant_id AND b.product_id <=> NEW.product_id
    AND b.unit_snapshot=NEW.unit_snapshot AND b.batch_status='available') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Outbound target batch must have the exact available identity and unit';
  END IF;
  IF NEW.source_type='production_material' AND NOT EXISTS(SELECT 1 FROM production_item_allocation a
    WHERE a.id=NEW.allocation_id AND a.demand_id=NEW.demand_id AND a.production_batch_id=parent_batch
      AND a.production_batch_id=NEW.production_batch_id AND a.item_id=NEW.item_id AND a.material_variant_id=NEW.material_variant_id
      AND a.batch_id=NEW.batch_id AND a.unit_snapshot=NEW.unit_snapshot AND a.allocation_status='active') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Production issue requires the matching active allocation and unit';
  END IF;


END;

CREATE TRIGGER trg_outbound_detail_update_guard BEFORE UPDATE ON outbound_detail FOR EACH ROW
BEGIN

  DECLARE parent_batch BIGINT UNSIGNED;
  DECLARE parent_source VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  DECLARE parent_status VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

  IF NOT(COALESCE(@company_inventory_test_cleanup,0)=1 AND (RIGHT(DATABASE(),5)='_test' OR RIGHT(DATABASE(),3)='_ci')) THEN
    
  SELECT source_type,status,production_batch_id INTO parent_source,parent_status,parent_batch
  FROM outbound_order WHERE id=NEW.outbound_id FOR UPDATE;
  IF parent_source IS NULL OR parent_status<>'pending_picking' OR NOT(NEW.source_type <=> parent_source)
    OR EXISTS(SELECT 1 FROM outbound_detail d JOIN inventory_transaction t ON t.reference_type='outbound_detail' AND t.reference_detail_id=d.id WHERE d.outbound_id=NEW.outbound_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Outbound detail requires its matching unposted pending order';
  END IF;

    IF OLD.source_type<>'other' OR OLD.is_deleted=1 OR NOT(NEW.id <=> OLD.id) OR NOT(NEW.outbound_id <=> OLD.outbound_id) OR NOT(NEW.line_no <=> OLD.line_no) OR NOT(NEW.source_type <=> OLD.source_type) OR NOT(NEW.created_by <=> OLD.created_by) OR NOT(NEW.created_at <=> OLD.created_at) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Only live other outbound drafts permit editing their business rows';
    END IF;
    IF NEW.is_deleted=1 AND (NOT(NEW.id <=> OLD.id)
      OR NOT(NEW.outbound_id <=> OLD.outbound_id)
      OR NOT(NEW.line_no <=> OLD.line_no)
      OR NOT(NEW.source_type <=> OLD.source_type)
      OR NOT(NEW.production_batch_id <=> OLD.production_batch_id)
      OR NOT(NEW.demand_id <=> OLD.demand_id)
      OR NOT(NEW.allocation_id <=> OLD.allocation_id)
      OR NOT(NEW.item_id <=> OLD.item_id)
      OR NOT(NEW.material_variant_id <=> OLD.material_variant_id)
      OR NOT(NEW.product_id <=> OLD.product_id)
      OR NOT(NEW.batch_id <=> OLD.batch_id)
      OR NOT(NEW.outbound_number <=> OLD.outbound_number)
      OR NOT(NEW.unit_snapshot <=> OLD.unit_snapshot)
      OR NOT(NEW.stock_status <=> OLD.stock_status)
      OR NOT(NEW.remark <=> OLD.remark)
      OR NOT(NEW.created_by <=> OLD.created_by)
      OR NOT(NEW.created_at <=> OLD.created_at)) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Soft deletion preserves the complete outbound business row';
    END IF;
    
  IF NOT EXISTS(SELECT 1 FROM item_batch b WHERE b.id=NEW.batch_id
    AND b.item_id <=> NEW.item_id AND b.material_variant_id <=> NEW.material_variant_id AND b.product_id <=> NEW.product_id
    AND b.unit_snapshot=NEW.unit_snapshot AND b.batch_status='available') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Outbound target batch must have the exact available identity and unit';
  END IF;
  IF NEW.source_type='production_material' AND NOT EXISTS(SELECT 1 FROM production_item_allocation a
    WHERE a.id=NEW.allocation_id AND a.demand_id=NEW.demand_id AND a.production_batch_id=parent_batch
      AND a.production_batch_id=NEW.production_batch_id AND a.item_id=NEW.item_id AND a.material_variant_id=NEW.material_variant_id
      AND a.batch_id=NEW.batch_id AND a.unit_snapshot=NEW.unit_snapshot AND a.allocation_status='active') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Production issue requires the matching active allocation and unit';
  END IF;

  END IF;

END;

CREATE TRIGGER trg_outbound_detail_delete_guard BEFORE DELETE ON outbound_detail FOR EACH ROW
BEGIN

  IF NOT(COALESCE(@company_inventory_test_cleanup,0)=1 AND (RIGHT(DATABASE(),5)='_test' OR RIGHT(DATABASE(),3)='_ci')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Outbound details cannot be physically deleted'; END IF;

END;

CREATE TRIGGER trg_inventory_transaction_source_guard BEFORE INSERT ON inventory_transaction FOR EACH ROW
BEGIN

  DECLARE parent_id BIGINT UNSIGNED;
  DECLARE source_allocation_id BIGINT UNSIGNED;
  DECLARE authorized_quantity BIGINT DEFAULT 0;
  DECLARE consumed_quantity BIGINT DEFAULT 0;
  DECLARE parent_source VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  DECLARE parent_status VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  DECLARE expected_type VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  IF NEW.reversal_of_transaction_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM inventory_transaction original WHERE original.id=NEW.reversal_of_transaction_id
      AND original.reversal_of_transaction_id IS NULL AND original.product_id IS NULL
      AND original.transaction_type NOT IN ('other_inbound','other_outbound')
      AND original.item_id <=> NEW.item_id AND original.material_variant_id <=> NEW.material_variant_id
      AND original.product_id <=> NEW.product_id AND original.batch_id=NEW.batch_id
      AND original.stock_status=NEW.stock_status AND original.unit_snapshot=NEW.unit_snapshot
      AND original.reference_type=NEW.reference_type AND original.reference_detail_id=NEW.reference_detail_id
      AND original.transaction_type=NEW.transaction_type AND original.quantity=-NEW.quantity
      AND original.transaction_group_key <=> NEW.transaction_group_key
    ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A reversal must mirror one original material fact in full'; END IF;
    IF NEW.reference_type='inbound_detail' AND NOT EXISTS(SELECT 1 FROM inbound_detail d JOIN inbound_order o ON o.id=d.inbound_id WHERE d.id=NEW.reference_detail_id AND o.status='completed' AND d.is_deleted=0) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A reversal requires its original completed inbound order';
    END IF;
    IF NEW.reference_type='outbound_detail' AND NOT EXISTS(SELECT 1 FROM outbound_detail d JOIN outbound_order o ON o.id=d.outbound_id WHERE d.id=NEW.reference_detail_id AND o.status='completed' AND d.is_deleted=0) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A reversal requires its original completed outbound order';
    END IF;
    IF NEW.reference_type='stock_check_detail' AND NOT EXISTS(SELECT 1 FROM stock_check_detail d JOIN stock_check_order o ON o.id=d.stock_check_id WHERE d.id=NEW.reference_detail_id AND o.status='completed') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A reversal requires its original completed stock check';
    END IF;
  ELSEIF NEW.reference_type='inbound_detail' THEN
    SELECT inbound_id INTO parent_id FROM inbound_detail WHERE id=NEW.reference_detail_id;
    SELECT source_type,status INTO parent_source,parent_status FROM inbound_order WHERE id=parent_id FOR UPDATE;
    SET expected_type=CASE parent_source WHEN 'purchased' THEN 'purchase_inbound' WHEN 'finished_product' THEN 'production_inbound' WHEN 'return_inbound' THEN 'material_return_inbound' WHEN 'other' THEN 'other_inbound' END;
    IF parent_status IS NULL OR parent_status<>'pending' OR NOT(NEW.transaction_type <=> expected_type)
      OR NEW.idempotency_key<>CONCAT('INBOUND:',NEW.reference_detail_id)
      OR NOT EXISTS(SELECT 1 FROM inbound_detail d JOIN item_batch b ON b.id=d.batch_id
        WHERE d.id=NEW.reference_detail_id AND d.is_deleted=0 AND d.source_type=parent_source
          AND d.item_id <=> NEW.item_id AND d.material_variant_id <=> NEW.material_variant_id AND d.product_id <=> NEW.product_id
          AND d.batch_id=NEW.batch_id AND d.inbound_number=NEW.quantity AND d.unit_snapshot=NEW.unit_snapshot
          AND d.stock_status='available' AND NEW.stock_status=d.stock_status
          AND b.item_id <=> d.item_id AND b.material_variant_id <=> d.material_variant_id AND b.product_id <=> d.product_id
          AND b.unit_snapshot=d.unit_snapshot AND (parent_source='return_inbound' OR b.batch_status='available')) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Original inbound posting must exactly match one live pending detail';
    END IF;
    IF parent_source='purchased' THEN
      SELECT d.procurement_allocation_id,a.quantity INTO source_allocation_id,authorized_quantity
      FROM inbound_detail d JOIN procurement_receipt_allocation a ON a.id=d.procurement_allocation_id WHERE d.id=NEW.reference_detail_id;
      SELECT COALESCE(SUM(t.quantity),0) INTO consumed_quantity FROM inbound_detail d
      JOIN inventory_transaction t ON t.reference_type='inbound_detail' AND t.reference_detail_id=d.id AND t.transaction_type='purchase_inbound' AND t.reversal_of_transaction_id IS NULL
      WHERE d.procurement_allocation_id=source_allocation_id AND d.is_deleted=0;
      IF consumed_quantity+NEW.quantity>authorized_quantity THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Purchase inbound exceeds the original allocation quantity'; END IF;
    ELSEIF parent_source='finished_product' THEN
      SELECT d.production_output_allocation_id,a.quantity INTO source_allocation_id,authorized_quantity
      FROM inbound_detail d JOIN production_output_allocation a ON a.id=d.production_output_allocation_id WHERE d.id=NEW.reference_detail_id;
      SELECT COALESCE(SUM(t.quantity),0) INTO consumed_quantity FROM inbound_detail d
      JOIN inventory_transaction t ON t.reference_type='inbound_detail' AND t.reference_detail_id=d.id AND t.transaction_type='production_inbound' AND t.reversal_of_transaction_id IS NULL
      WHERE d.production_output_allocation_id=source_allocation_id AND d.is_deleted=0;
      IF consumed_quantity+NEW.quantity>authorized_quantity THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished inbound exceeds the approved allocation quantity'; END IF;
    END IF;
  ELSEIF NEW.reference_type='outbound_detail' THEN
    SELECT outbound_id INTO parent_id FROM outbound_detail WHERE id=NEW.reference_detail_id;
    SELECT source_type,status INTO parent_source,parent_status FROM outbound_order WHERE id=parent_id FOR UPDATE;
    SET expected_type=CASE parent_source WHEN 'production_material' THEN 'production_material_outbound' WHEN 'other' THEN 'other_outbound' END;
    IF parent_status IS NULL OR parent_status<>'pending_picking' OR NOT(NEW.transaction_type <=> expected_type)
      OR NEW.idempotency_key<>CONCAT('OUTBOUND:',NEW.reference_detail_id)
      OR NOT EXISTS(SELECT 1 FROM outbound_detail d JOIN item_batch b ON b.id=d.batch_id
        WHERE d.id=NEW.reference_detail_id AND d.is_deleted=0 AND d.source_type=parent_source
          AND d.item_id <=> NEW.item_id AND d.material_variant_id <=> NEW.material_variant_id AND d.product_id <=> NEW.product_id
          AND d.batch_id=NEW.batch_id AND -d.outbound_number=NEW.quantity AND d.unit_snapshot=NEW.unit_snapshot
          AND d.stock_status='available' AND NEW.stock_status=d.stock_status AND b.batch_status='available'
          AND b.item_id <=> d.item_id AND b.material_variant_id <=> d.material_variant_id AND b.product_id <=> d.product_id
          AND b.unit_snapshot=d.unit_snapshot) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Original outbound posting must exactly match one live pending detail';
    END IF;
  ELSEIF NEW.reference_type='stock_check_detail' THEN
    SELECT stock_check_id INTO parent_id FROM stock_check_detail WHERE id=NEW.reference_detail_id;
    SELECT status INTO parent_status FROM stock_check_order WHERE id=parent_id FOR UPDATE;
    IF parent_status IS NULL OR parent_status NOT IN ('pending','counting') OR NEW.transaction_type<>'stock_check_adjustment'
      OR NEW.idempotency_key<>CONCAT('STOCKCHECK:',NEW.reference_detail_id)
      OR NOT EXISTS(SELECT 1 FROM stock_check_detail d JOIN item_batch b ON b.id=d.batch_id
        WHERE d.id=NEW.reference_detail_id AND d.adjusted=0 AND d.actual_quantity IS NOT NULL
          AND d.difference_quantity<>0 AND d.difference_quantity=NEW.quantity
          AND d.item_id=NEW.item_id AND d.material_variant_id=NEW.material_variant_id AND NEW.product_id IS NULL
          AND d.batch_id=NEW.batch_id AND d.stock_status=NEW.stock_status AND d.unit_snapshot=NEW.unit_snapshot
          AND b.unit_snapshot=NEW.unit_snapshot) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Stock check posting requires the nonzero recorded difference in its counting phase';
    END IF;
  ELSE
    -- Preserve material foundation types without opening new application commands.
    IF NOT EXISTS(SELECT 1 FROM item_batch b WHERE b.id=NEW.batch_id
      AND b.item_id=NEW.item_id AND b.material_variant_id=NEW.material_variant_id AND b.product_id IS NULL
      AND b.unit_snapshot=NEW.unit_snapshot) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Material foundation posting requires the exact batch identity and unit';
    END IF;
  END IF;

END;

CREATE TRIGGER trg_item_batch_creation_guard BEFORE INSERT ON item_batch FOR EACH ROW
BEGIN

  IF NEW.created_by IS NULL OR NEW.updated_by IS NULL OR NEW.version<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A new inventory batch requires creation audit and version zero';
  END IF;
  IF NEW.source_type='other' AND (NEW.provider IS NOT NULL OR NEW.source_work_order_id IS NOT NULL
    OR NEW.source_production_batch_id IS NOT NULL OR NEW.production_date IS NOT NULL OR NEW.remark IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='An other new batch does not carry a business source date or description';
  END IF;

END;


-- New page/API permission metadata only; initialization still owns roles and accounts.
CREATE TEMPORARY TABLE guard_general_inventory_permissions (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_general_inventory_permissions SELECT IF((SELECT COUNT(*) FROM permissions WHERE code='warehouse:view' AND type='menu')=1,1,0);
DROP TEMPORARY TABLE guard_general_inventory_permissions;

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'其他入库','warehouse:other-inbounds:view','page','/warehouse/other-inbounds',NULL,NULL,440,1 FROM permissions WHERE code='warehouse:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),route_path=VALUES(route_path),api_method=VALUES(api_method),api_path=VALUES(api_path),sort_order=VALUES(sort_order);

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'创建其他入库','warehouse:other-inbounds:create','api',NULL,'POST','/api/warehouse/other-inbounds',441,1 FROM permissions WHERE code='warehouse:other-inbounds:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),route_path=VALUES(route_path),api_method=VALUES(api_method),api_path=VALUES(api_path),sort_order=VALUES(sort_order);

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'编辑其他入库','warehouse:other-inbounds:update','api',NULL,'PATCH','/api/warehouse/other-inbounds/:orderId',442,1 FROM permissions WHERE code='warehouse:other-inbounds:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),route_path=VALUES(route_path),api_method=VALUES(api_method),api_path=VALUES(api_path),sort_order=VALUES(sort_order);

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'确认其他入库','warehouse:other-inbounds:confirm','api',NULL,'POST','/api/warehouse/other-inbounds/:orderId/actions/confirm',443,1 FROM permissions WHERE code='warehouse:other-inbounds:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),route_path=VALUES(route_path),api_method=VALUES(api_method),api_path=VALUES(api_path),sort_order=VALUES(sort_order);

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'取消其他入库','warehouse:other-inbounds:cancel','api',NULL,'POST','/api/warehouse/other-inbounds/:orderId/actions/cancel',444,1 FROM permissions WHERE code='warehouse:other-inbounds:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),route_path=VALUES(route_path),api_method=VALUES(api_method),api_path=VALUES(api_path),sort_order=VALUES(sort_order);

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'其他出库','warehouse:other-outbounds:view','page','/warehouse/other-outbounds',NULL,NULL,450,1 FROM permissions WHERE code='warehouse:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),route_path=VALUES(route_path),api_method=VALUES(api_method),api_path=VALUES(api_path),sort_order=VALUES(sort_order);

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'创建其他出库','warehouse:other-outbounds:create','api',NULL,'POST','/api/warehouse/other-outbounds',451,1 FROM permissions WHERE code='warehouse:other-outbounds:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),route_path=VALUES(route_path),api_method=VALUES(api_method),api_path=VALUES(api_path),sort_order=VALUES(sort_order);

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'编辑其他出库','warehouse:other-outbounds:update','api',NULL,'PATCH','/api/warehouse/other-outbounds/:orderId',452,1 FROM permissions WHERE code='warehouse:other-outbounds:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),route_path=VALUES(route_path),api_method=VALUES(api_method),api_path=VALUES(api_path),sort_order=VALUES(sort_order);

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'确认其他出库','warehouse:other-outbounds:confirm','api',NULL,'POST','/api/warehouse/other-outbounds/:orderId/actions/confirm',453,1 FROM permissions WHERE code='warehouse:other-outbounds:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),route_path=VALUES(route_path),api_method=VALUES(api_method),api_path=VALUES(api_path),sort_order=VALUES(sort_order);

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'取消其他出库','warehouse:other-outbounds:cancel','api',NULL,'POST','/api/warehouse/other-outbounds/:orderId/actions/cancel',454,1 FROM permissions WHERE code='warehouse:other-outbounds:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),route_path=VALUES(route_path),api_method=VALUES(api_method),api_path=VALUES(api_path),sort_order=VALUES(sort_order);
