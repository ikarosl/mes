-- The preserving alternative has the same target schema as 202610140001.
-- Down permits only an entirely unused schema; retained business facts require
-- restoring a verified pre-upgrade backup while every writer remains stopped.
-- Pause Inventory, Production, Procurement, Quality, Approval and command writes.
-- This development schema change refuses existing logistics / snapshot evidence;
-- use the authorized rebuild and unified db:init, never invent old source facts.
CREATE TEMPORARY TABLE guard_general_inventory_documents (ok TINYINT NOT NULL CHECK (ok=1));
INSERT INTO guard_general_inventory_documents SELECT IF(
  EXISTS(SELECT 1 FROM inbound_order) OR EXISTS(SELECT 1 FROM inbound_detail)
  OR EXISTS(SELECT 1 FROM outbound_order) OR EXISTS(SELECT 1 FROM outbound_detail)
  
  OR EXISTS(SELECT 1 FROM inventory_transaction) OR EXISTS(SELECT 1 FROM item_batch)
  OR EXISTS(SELECT 1 FROM inventory_batch_balance) OR EXISTS(SELECT 1 FROM inventory_material_variant_balance)
  OR EXISTS(SELECT 1 FROM stock_check_order) OR EXISTS(SELECT 1 FROM stock_check_detail)
  OR EXISTS(SELECT 1 FROM procurement_receipt) OR EXISTS(SELECT 1 FROM production_batch_closeout)
  OR EXISTS(SELECT 1 FROM production_output_revision) OR EXISTS(SELECT 1 FROM production_demand_correction)
  OR EXISTS(SELECT 1 FROM item_scrap) OR EXISTS(SELECT 1 FROM http_idempotency_records)
  OR EXISTS(SELECT 1 FROM operation_logs WHERE target_type IN ('inbound_order','inbound_detail','outbound_order','outbound_detail','return_order','return_detail','inventory_transaction','item_batch','stock_check_order','stock_check_detail'))
  OR EXISTS(SELECT 1 FROM approval_instances WHERE scene_code LIKE 'production%')
  ,0,1);
DROP TEMPORARY TABLE guard_general_inventory_documents;

DROP TRIGGER trg_inbound_order_insert_guard;
DROP TRIGGER trg_inbound_order_update_guard;
DROP TRIGGER trg_inbound_order_delete_guard;
DROP TRIGGER trg_outbound_order_insert_guard;
DROP TRIGGER trg_outbound_order_update_guard;
DROP TRIGGER trg_outbound_order_delete_guard;
DROP TRIGGER trg_inbound_detail_insert_guard;
DROP TRIGGER trg_inbound_detail_update_guard;
DROP TRIGGER trg_inbound_detail_delete_guard;
DROP TRIGGER trg_outbound_detail_insert_guard;
DROP TRIGGER trg_outbound_detail_update_guard;
DROP TRIGGER trg_outbound_detail_delete_guard;
DROP TRIGGER trg_inventory_transaction_source_guard;
DROP TRIGGER trg_item_batch_creation_guard;

ALTER TABLE inbound_order
  DROP FOREIGN KEY fk_inbound_order_work_order,
  DROP FOREIGN KEY fk_inbound_order_batch_work_order,
  DROP FOREIGN KEY fk_inbound_order_operator_id,
  DROP FOREIGN KEY fk_inbound_order_cancelled_by,
  DROP FOREIGN KEY fk_inbound_order_created_by,
  DROP FOREIGN KEY fk_inbound_order_updated_by,
  DROP FOREIGN KEY fk_inbound_order_product,
  DROP FOREIGN KEY fk_inbound_order_batch_product;

ALTER TABLE inbound_detail
  DROP FOREIGN KEY fk_inbound_detail_order_source,
  DROP FOREIGN KEY fk_inbound_detail_order_batch,
  DROP FOREIGN KEY fk_inbound_detail_demand_batch,
  DROP FOREIGN KEY fk_inbound_detail_item,
  DROP FOREIGN KEY fk_inbound_detail_variant,
  DROP FOREIGN KEY fk_inbound_detail_product,
  DROP FOREIGN KEY fk_inbound_detail_batch_material,
  DROP FOREIGN KEY fk_inbound_detail_batch_product,
  DROP FOREIGN KEY fk_inbound_detail_created_by,
  DROP FOREIGN KEY fk_inbound_detail_updated_by,
  DROP FOREIGN KEY fk_inbound_detail_deleted_by,
  DROP FOREIGN KEY fk_inbound_detail_return_allocation,
  DROP FOREIGN KEY fk_inbound_detail_procurement_material,
  DROP FOREIGN KEY fk_inbound_detail_procurement_revision,
  DROP FOREIGN KEY fk_inbound_detail_procurement_inspection,
  DROP FOREIGN KEY fk_inbound_detail_procurement_allocation,
  DROP FOREIGN KEY fk_inbound_detail_output_allocation;

ALTER TABLE outbound_order
  DROP FOREIGN KEY fk_outbound_order_work_order,
  DROP FOREIGN KEY fk_outbound_order_batch_work_order,
  DROP FOREIGN KEY fk_outbound_order_operator_id,
  DROP FOREIGN KEY fk_outbound_order_cancelled_by,
  DROP FOREIGN KEY fk_outbound_order_created_by,
  DROP FOREIGN KEY fk_outbound_order_updated_by;

ALTER TABLE outbound_detail
  DROP FOREIGN KEY fk_outbound_detail_order_source,
  DROP FOREIGN KEY fk_outbound_detail_order_batch,
  DROP FOREIGN KEY fk_outbound_detail_demand_batch,
  DROP FOREIGN KEY fk_outbound_detail_item,
  DROP FOREIGN KEY fk_outbound_detail_variant,
  DROP FOREIGN KEY fk_outbound_detail_product,
  DROP FOREIGN KEY fk_outbound_detail_batch_material,
  DROP FOREIGN KEY fk_outbound_detail_batch_product,
  DROP FOREIGN KEY fk_outbound_detail_created_by,
  DROP FOREIGN KEY fk_outbound_detail_updated_by,
  DROP FOREIGN KEY fk_outbound_detail_deleted_by,
  DROP FOREIGN KEY fk_outbound_detail_allocation;

ALTER TABLE inventory_transaction
  DROP FOREIGN KEY fk_inventory_transaction_created_by,
  DROP FOREIGN KEY fk_inventory_transaction_item,
  DROP FOREIGN KEY fk_inventory_transaction_variant,
  DROP FOREIGN KEY fk_inventory_transaction_product,
  DROP FOREIGN KEY fk_inventory_transaction_batch_material,
  DROP FOREIGN KEY fk_inventory_transaction_batch_product,
  DROP FOREIGN KEY fk_inventory_transaction_reversal,
  DROP FOREIGN KEY fk_inventory_transaction_inbound_detail,
  DROP FOREIGN KEY fk_inventory_transaction_inbound_material,
  DROP FOREIGN KEY fk_inventory_transaction_inbound_product,
  DROP FOREIGN KEY fk_inventory_transaction_outbound_detail,
  DROP FOREIGN KEY fk_inventory_transaction_outbound_material,
  DROP FOREIGN KEY fk_inventory_transaction_outbound_product,
  DROP FOREIGN KEY fk_inventory_transaction_stock_check_detail,
  DROP FOREIGN KEY fk_inventory_transaction_stock_check_material;

ALTER TABLE inbound_order
  DROP CHECK chk_inbound_order_status,
  DROP CHECK chk_inbound_order_version,
  DROP CHECK chk_inbound_order_number,
  DROP CHECK chk_inbound_order_state,
  DROP CHECK chk_inbound_order_source_type,
  DROP CHECK chk_inbound_order_source,
  DROP INDEX uk_inbound_order_no,
  DROP INDEX uk_inbound_order_id_source,
  DROP INDEX uk_inbound_order_id_batch,
  DROP INDEX idx_inbound_order_source_status_created,
  DROP INDEX idx_inbound_order_batch_source_status,
  DROP INDEX idx_inbound_order_work_order,
  DROP INDEX idx_inbound_order_batch_work_order,
  DROP INDEX idx_inbound_order_operator_id,
  DROP INDEX idx_inbound_order_cancelled_by,
  DROP INDEX idx_inbound_order_created_by,
  DROP INDEX idx_inbound_order_updated_by,
  DROP INDEX idx_inbound_order_product,
  DROP INDEX idx_inbound_order_batch_product;

ALTER TABLE inbound_detail
  DROP CHECK chk_inbound_detail_identity,
  DROP CHECK chk_inbound_detail_quantity,
  DROP CHECK chk_inbound_detail_line,
  DROP CHECK chk_inbound_detail_unit,
  DROP CHECK chk_inbound_detail_stock_status,
  DROP CHECK chk_inbound_detail_deletion,
  DROP CHECK chk_inbound_detail_code,
  DROP CHECK chk_inbound_detail_target,
  DROP CHECK chk_inbound_detail_source,
  DROP INDEX uk_inbound_detail_order_line,
  DROP INDEX uk_inbound_detail_order_allocation,
  DROP INDEX uk_inbound_detail_material_reference,
  DROP INDEX uk_inbound_detail_product_reference,
  DROP INDEX idx_inbound_detail_order_deleted,
  DROP INDEX idx_inbound_detail_order_source,
  DROP INDEX idx_inbound_detail_order_batch,
  DROP INDEX idx_inbound_detail_batch,
  DROP INDEX idx_inbound_detail_batch_material,
  DROP INDEX idx_inbound_detail_batch_product,
  DROP INDEX idx_inbound_detail_item,
  DROP INDEX idx_inbound_detail_variant,
  DROP INDEX idx_inbound_detail_product,
  DROP INDEX idx_inbound_detail_demand_batch,
  DROP INDEX idx_inbound_detail_created_by,
  DROP INDEX idx_inbound_detail_updated_by,
  DROP INDEX idx_inbound_detail_deleted_by,
  DROP INDEX idx_inbound_detail_new_batch,
  DROP INDEX idx_inbound_detail_procurement_allocation,
  DROP INDEX idx_inbound_detail_procurement_receipt,
  DROP INDEX idx_inbound_detail_procurement_inspection,
  DROP INDEX idx_inbound_detail_output_allocation,
  DROP INDEX idx_inbound_detail_return_allocation,
  DROP INDEX idx_inbound_detail_return_source,
  DROP INDEX idx_inbound_detail_procurement_material,
  DROP INDEX idx_inbound_detail_procurement_revision,
  DROP INDEX idx_inbound_detail_procurement_inspection_source,
  DROP INDEX idx_inbound_detail_procurement_allocation_source;

ALTER TABLE outbound_order
  DROP CHECK chk_outbound_order_status,
  DROP CHECK chk_outbound_order_version,
  DROP CHECK chk_outbound_order_number,
  DROP CHECK chk_outbound_order_state,
  DROP CHECK chk_outbound_order_source_type,
  DROP CHECK chk_outbound_order_source,
  DROP CHECK chk_outbound_order_cancel_source,
  DROP INDEX uk_outbound_order_no,
  DROP INDEX uk_outbound_order_id_source,
  DROP INDEX uk_outbound_order_id_batch,
  DROP INDEX idx_outbound_order_source_status_created,
  DROP INDEX idx_outbound_order_batch_source_status,
  DROP INDEX idx_outbound_order_work_order,
  DROP INDEX idx_outbound_order_batch_work_order,
  DROP INDEX idx_outbound_order_operator_id,
  DROP INDEX idx_outbound_order_cancelled_by,
  DROP INDEX idx_outbound_order_created_by,
  DROP INDEX idx_outbound_order_updated_by;

ALTER TABLE outbound_detail
  DROP CHECK chk_outbound_detail_identity,
  DROP CHECK chk_outbound_detail_quantity,
  DROP CHECK chk_outbound_detail_line,
  DROP CHECK chk_outbound_detail_unit,
  DROP CHECK chk_outbound_detail_stock_status,
  DROP CHECK chk_outbound_detail_deletion,
  DROP CHECK chk_outbound_detail_source,
  DROP INDEX uk_outbound_detail_order_line,
  DROP INDEX uk_outbound_detail_order_allocation,
  DROP INDEX uk_outbound_detail_material_reference,
  DROP INDEX uk_outbound_detail_product_reference,
  DROP INDEX idx_outbound_detail_order_deleted,
  DROP INDEX idx_outbound_detail_order_source,
  DROP INDEX idx_outbound_detail_order_batch,
  DROP INDEX idx_outbound_detail_batch,
  DROP INDEX idx_outbound_detail_batch_material,
  DROP INDEX idx_outbound_detail_batch_product,
  DROP INDEX idx_outbound_detail_item,
  DROP INDEX idx_outbound_detail_variant,
  DROP INDEX idx_outbound_detail_product,
  DROP INDEX idx_outbound_detail_demand_batch,
  DROP INDEX idx_outbound_detail_created_by,
  DROP INDEX idx_outbound_detail_updated_by,
  DROP INDEX idx_outbound_detail_deleted_by,
  DROP INDEX idx_outbound_detail_allocation,
  DROP INDEX idx_outbound_detail_demand,
  DROP INDEX idx_outbound_detail_allocation_source;

ALTER TABLE inventory_transaction
  DROP CHECK chk_inventory_transaction_identity,
  DROP CHECK chk_inventory_transaction_quantity,
  DROP CHECK chk_inventory_transaction_unit,
  DROP CHECK chk_inventory_transaction_idempotency,
  DROP CHECK chk_inventory_transaction_reference,
  DROP CHECK chk_inventory_transaction_stock_status,
  DROP CHECK chk_inventory_transaction_type,
  DROP CHECK chk_inventory_transaction_type_source,
  DROP CHECK chk_inventory_transaction_direction,
  DROP CHECK chk_inventory_transaction_finished_scope,
  DROP CHECK chk_inventory_transaction_other_original,
  DROP CHECK chk_inventory_transaction_transfer_group,
  DROP INDEX uk_inventory_transaction_idempotency,
  DROP INDEX uk_inventory_transaction_reversal,
  DROP INDEX uk_inventory_transaction_original_posting,
  DROP INDEX idx_inventory_transaction_reference,
  DROP INDEX idx_inventory_transaction_stock,
  DROP INDEX idx_inventory_transaction_product_stock,
  DROP INDEX idx_inventory_transaction_group,
  DROP INDEX idx_inventory_transaction_batch_status,
  DROP INDEX idx_inventory_transaction_variant,
  DROP INDEX idx_inventory_transaction_batch_material,
  DROP INDEX idx_inventory_transaction_batch_product,
  DROP INDEX idx_inventory_transaction_created_by,
  DROP INDEX idx_inventory_transaction_inbound_material,
  DROP INDEX idx_inventory_transaction_inbound_product,
  DROP INDEX idx_inventory_transaction_outbound_material,
  DROP INDEX idx_inventory_transaction_outbound_product,
  DROP INDEX idx_inventory_transaction_stock_check_material;

ALTER TABLE stock_check_detail DROP INDEX uk_stock_check_detail_material_reference;
ALTER TABLE item_batch DROP CHECK chk_item_batch_snapshots;

ALTER TABLE inbound_order
  DROP COLUMN reason,
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST,
  MODIFY COLUMN `inbound_no` varchar(100) NOT NULL AFTER id,
  MODIFY COLUMN `source_type` varchar(30) NOT NULL DEFAULT 'purchased' AFTER inbound_no,
  MODIFY COLUMN `work_order_id` bigint unsigned DEFAULT NULL AFTER source_type,
  MODIFY COLUMN `production_batch_id` bigint unsigned DEFAULT NULL AFTER work_order_id,
  MODIFY COLUMN `product_id` bigint unsigned DEFAULT NULL AFTER production_batch_id,
  MODIFY COLUMN `status` varchar(30) NOT NULL DEFAULT 'pending' AFTER product_id,
  MODIFY COLUMN `inbound_at` datetime DEFAULT NULL AFTER status,
  MODIFY COLUMN `operator_id` bigint unsigned DEFAULT NULL AFTER inbound_at,
  MODIFY COLUMN `version` int NOT NULL DEFAULT '0' AFTER operator_id,
  MODIFY COLUMN `remark` text AFTER version,
  MODIFY COLUMN `cancel_reason` text AFTER remark,
  MODIFY COLUMN `cancelled_by` bigint unsigned DEFAULT NULL AFTER cancel_reason,
  MODIFY COLUMN `cancelled_at` datetime DEFAULT NULL AFTER cancelled_by,
  MODIFY COLUMN `created_by` bigint unsigned DEFAULT NULL AFTER cancelled_at,
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by,
  MODIFY COLUMN `updated_by` bigint unsigned DEFAULT NULL AFTER created_at,
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER updated_by;

ALTER TABLE inbound_detail
  DROP COLUMN line_no,
  DROP COLUMN source_type,
  DROP COLUMN target_mode,
  DROP COLUMN new_batch_key,
  DROP COLUMN production_batch_id,
  DROP COLUMN demand_id,
  DROP COLUMN return_allocation_id,
  DROP COLUMN updated_by,
  DROP COLUMN updated_at,
  DROP COLUMN is_deleted,
  DROP COLUMN deleted_by,
  DROP COLUMN deleted_at,
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST,
  MODIFY COLUMN `inbound_id` bigint unsigned NOT NULL AFTER id,
  MODIFY COLUMN `item_id` bigint unsigned DEFAULT NULL AFTER inbound_id,
  MODIFY COLUMN `material_variant_id` bigint unsigned DEFAULT NULL AFTER item_id,
  MODIFY COLUMN `product_id` bigint unsigned DEFAULT NULL AFTER material_variant_id,
  MODIFY COLUMN `production_output_allocation_id` bigint unsigned DEFAULT NULL AFTER product_id,
  MODIFY COLUMN `batch_id` bigint unsigned NOT NULL AFTER production_output_allocation_id,
  MODIFY COLUMN `item_code_snapshot` varchar(100) NOT NULL AFTER batch_id,
  MODIFY COLUMN `supplier_name_snapshot` varchar(100) DEFAULT NULL AFTER item_code_snapshot,
  MODIFY COLUMN `inbound_number` int NOT NULL AFTER supplier_name_snapshot,
  MODIFY COLUMN `unit_snapshot` varchar(20) NOT NULL AFTER inbound_number,
  MODIFY COLUMN `stock_status` varchar(20) NOT NULL DEFAULT 'available' AFTER unit_snapshot,
  ADD COLUMN `source_stage` varchar(100) DEFAULT NULL AFTER stock_status,
  MODIFY COLUMN `remark` text AFTER source_stage,
  MODIFY COLUMN `created_by` bigint unsigned DEFAULT NULL AFTER remark,
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by,
  MODIFY COLUMN `procurement_receipt_line_id` bigint unsigned DEFAULT NULL AFTER created_at,
  MODIFY COLUMN `procurement_receipt_revision_id` bigint unsigned DEFAULT NULL AFTER procurement_receipt_line_id,
  MODIFY COLUMN `procurement_inspection_id` bigint unsigned DEFAULT NULL AFTER procurement_receipt_revision_id,
  MODIFY COLUMN `procurement_allocation_id` bigint unsigned DEFAULT NULL AFTER procurement_inspection_id;

ALTER TABLE outbound_order
  DROP COLUMN source_type,
  DROP COLUMN reason,
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST,
  MODIFY COLUMN `outbound_no` varchar(100) NOT NULL AFTER id,
  MODIFY COLUMN `production_batch_id` bigint unsigned NOT NULL AFTER outbound_no,
  MODIFY COLUMN `work_order_id` bigint unsigned NOT NULL AFTER production_batch_id,
  MODIFY COLUMN `status` varchar(30) NOT NULL DEFAULT 'pending_picking' AFTER work_order_id,
  MODIFY COLUMN `outbound_at` datetime DEFAULT NULL AFTER status,
  MODIFY COLUMN `operator_id` bigint unsigned DEFAULT NULL AFTER outbound_at,
  MODIFY COLUMN `version` int NOT NULL DEFAULT '0' AFTER operator_id,
  MODIFY COLUMN `remark` text AFTER version,
  MODIFY COLUMN `cancel_source` varchar(30) DEFAULT NULL AFTER remark,
  MODIFY COLUMN `cancel_reason` text AFTER cancel_source,
  MODIFY COLUMN `cancelled_by` bigint unsigned DEFAULT NULL AFTER cancel_reason,
  MODIFY COLUMN `cancelled_at` datetime DEFAULT NULL AFTER cancelled_by,
  MODIFY COLUMN `created_by` bigint unsigned DEFAULT NULL AFTER cancelled_at,
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by,
  MODIFY COLUMN `updated_by` bigint unsigned DEFAULT NULL AFTER created_at,
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER updated_by;

ALTER TABLE outbound_detail
  DROP COLUMN line_no,
  DROP COLUMN source_type,
  DROP COLUMN product_id,
  DROP COLUMN stock_status,
  DROP COLUMN remark,
  DROP COLUMN updated_by,
  DROP COLUMN updated_at,
  DROP COLUMN is_deleted,
  DROP COLUMN deleted_by,
  DROP COLUMN deleted_at,
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST,
  MODIFY COLUMN `outbound_id` bigint unsigned NOT NULL AFTER id,
  MODIFY COLUMN `production_batch_id` bigint unsigned NOT NULL AFTER outbound_id,
  MODIFY COLUMN `demand_id` bigint unsigned NOT NULL AFTER production_batch_id,
  MODIFY COLUMN `allocation_id` bigint unsigned NOT NULL AFTER demand_id,
  MODIFY COLUMN `item_id` bigint unsigned NOT NULL AFTER allocation_id,
  MODIFY COLUMN `material_variant_id` bigint unsigned NOT NULL AFTER item_id,
  MODIFY COLUMN `batch_id` bigint unsigned NOT NULL AFTER material_variant_id,
  MODIFY COLUMN `outbound_number` int NOT NULL AFTER batch_id,
  MODIFY COLUMN `unit_snapshot` varchar(20) NOT NULL AFTER outbound_number,
  MODIFY COLUMN `created_by` bigint unsigned DEFAULT NULL AFTER unit_snapshot,
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by;

ALTER TABLE inventory_transaction
  DROP COLUMN inbound_detail_ref,
  DROP COLUMN outbound_detail_ref,
  DROP COLUMN stock_check_detail_ref,
  DROP COLUMN original_posting_key,
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST,
  MODIFY COLUMN `item_id` bigint unsigned DEFAULT NULL AFTER id,
  MODIFY COLUMN `material_variant_id` bigint unsigned DEFAULT NULL AFTER item_id,
  MODIFY COLUMN `product_id` bigint unsigned DEFAULT NULL AFTER material_variant_id,
  MODIFY COLUMN `batch_id` bigint unsigned NOT NULL AFTER product_id,
  MODIFY COLUMN `transaction_type` varchar(30) NOT NULL AFTER batch_id,
  MODIFY COLUMN `quantity` int NOT NULL AFTER transaction_type,
  MODIFY COLUMN `unit_snapshot` varchar(20) NOT NULL AFTER quantity,
  MODIFY COLUMN `stock_status` varchar(20) NOT NULL DEFAULT 'available' AFTER unit_snapshot,
  MODIFY COLUMN `reference_type` varchar(50) NOT NULL AFTER stock_status,
  MODIFY COLUMN `reference_detail_id` bigint unsigned NOT NULL AFTER reference_type,
  MODIFY COLUMN `idempotency_key` varchar(150) NOT NULL AFTER reference_detail_id,
  MODIFY COLUMN `transaction_group_key` varchar(150) DEFAULT NULL AFTER idempotency_key,
  MODIFY COLUMN `reversal_of_transaction_id` bigint unsigned DEFAULT NULL AFTER transaction_group_key,
  MODIFY COLUMN `remark` text AFTER reversal_of_transaction_id,
  MODIFY COLUMN `created_by` bigint unsigned NOT NULL AFTER remark,
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by;

ALTER TABLE inbound_order
  ADD UNIQUE KEY `uk_inbound_order_no` (`inbound_no`),
  ADD UNIQUE KEY `uk_inbound_order_id_source` (`id`,`source_type`),
  ADD UNIQUE KEY `uk_inbound_order_id_product` (`id`,`product_id`),
  ADD KEY `idx_inbound_order_status_created` (`status`,`created_at`),
  ADD KEY `fk_inbound_order_work_order` (`work_order_id`),
  ADD KEY `fk_inbound_order_batch_work_order` (`production_batch_id`,`work_order_id`),
  ADD KEY `fk_inbound_order_operator` (`operator_id`),
  ADD KEY `fk_inbound_order_created_by` (`created_by`),
  ADD KEY `fk_inbound_order_updated_by` (`updated_by`),
  ADD KEY `idx_inbound_order_cancelled_by` (`cancelled_by`),
  ADD CONSTRAINT `chk_inbound_order_finished_identity` CHECK ((((`source_type` = _utf8mb4'finished_product') and (`product_id` is not null) and (`production_batch_id` is not null) and (`work_order_id` is not null)) or ((`source_type` <> _utf8mb4'finished_product') and (`product_id` is null)))),
  ADD CONSTRAINT `chk_inbound_order_source_type` CHECK ((`source_type` in (_utf8mb4'finished_product',_utf8mb4'self_made',_utf8mb4'production_extra',_utf8mb4'purchased',_utf8mb4'outsourced',_utf8mb4'return_inbound',_utf8mb4'stock_check_generated',_utf8mb4'other'))),
  ADD CONSTRAINT `chk_inbound_order_status` CHECK ((`status` in (_utf8mb4'pending',_utf8mb4'completed',_utf8mb4'cancelled'))),
  ADD CONSTRAINT `chk_inbound_order_version` CHECK ((`version` >= 0));

ALTER TABLE inbound_detail
  ADD UNIQUE KEY `uk_inbound_detail_finished_reference` (`id`,`product_id`,`batch_id`),
  ADD KEY `idx_inbound_detail_item_batch` (`item_id`,`batch_id`),
  ADD KEY `fk_inbound_detail_created_by` (`created_by`),
  ADD KEY `idx_inbound_detail_batch_product` (`batch_id`,`product_id`),
  ADD KEY `fk_inbound_detail_variant` (`material_variant_id`,`item_id`),
  ADD KEY `idx_inbound_detail_procurement_receipt` (`procurement_receipt_line_id`,`id`),
  ADD KEY `idx_inbound_detail_procurement_inspection` (`procurement_inspection_id`,`id`),
  ADD KEY `fk_inbound_detail_procurement_revision` (`procurement_receipt_revision_id`,`procurement_receipt_line_id`),
  ADD KEY `fk_inbound_detail_procurement_material` (`procurement_receipt_line_id`,`item_id`,`material_variant_id`),
  ADD KEY `fk_inbound_detail_procurement_inspection` (`procurement_inspection_id`,`procurement_receipt_line_id`),
  ADD KEY `idx_inbound_detail_allocation` (`procurement_allocation_id`,`id`),
  ADD KEY `fk_inbound_detail_allocation` (`procurement_allocation_id`,`procurement_receipt_line_id`),
  ADD KEY `idx_inbound_detail_order_product` (`inbound_id`,`product_id`),
  ADD KEY `idx_inbound_detail_output_allocation` (`production_output_allocation_id`,`id`),
  ADD KEY `fk_inbound_detail_batch_variant` (`batch_id`,`item_id`,`material_variant_id`),
  ADD CONSTRAINT `chk_inbound_detail_identity` CHECK ((((`product_id` is null) and (`item_id` is not null) and (`material_variant_id` is not null) and (`production_output_allocation_id` is null)) or ((`product_id` is not null) and (`item_id` is null) and (`material_variant_id` is null) and (`production_output_allocation_id` is not null) and (`stock_status` = _utf8mb4'available')))),
  ADD CONSTRAINT `chk_inbound_detail_procurement_source` CHECK ((((`procurement_receipt_line_id` is null) and (`procurement_receipt_revision_id` is null) and (`procurement_allocation_id` is null) and (`procurement_inspection_id` is null)) or ((`product_id` is null) and (`procurement_receipt_line_id` is not null) and (`procurement_receipt_revision_id` is not null) and (`procurement_allocation_id` is not null) and (`procurement_inspection_id` is not null)))),
  ADD CONSTRAINT `chk_inbound_detail_quantity` CHECK ((`inbound_number` > 0)),
  ADD CONSTRAINT `chk_inbound_detail_quantity_integer` CHECK ((`inbound_number` = truncate(`inbound_number`,0))),
  ADD CONSTRAINT `chk_inbound_detail_stock_status` CHECK ((`stock_status` in (_utf8mb4'available',_utf8mb4'pending_inspection',_utf8mb4'frozen',_utf8mb4'defective'))),
  ADD CONSTRAINT `chk_inbound_detail_supplier_snapshot` CHECK ((((`product_id` is null) or (`supplier_name_snapshot` is null)) and ((`procurement_allocation_id` is null) or (`supplier_name_snapshot` is not null)))),
  ADD CONSTRAINT `chk_integer_storage_inbound_detail` CHECK ((`inbound_number` between 0 and 99999999));

ALTER TABLE outbound_order
  ADD UNIQUE KEY `uk_outbound_order_no` (`outbound_no`),
  ADD UNIQUE KEY `uk_outbound_order_id_batch` (`id`,`production_batch_id`),
  ADD KEY `idx_outbound_order_status_created` (`status`,`created_at`),
  ADD KEY `idx_outbound_order_batch_created` (`production_batch_id`,`created_at`),
  ADD KEY `fk_outbound_order_batch_work_order` (`production_batch_id`,`work_order_id`),
  ADD KEY `fk_outbound_order_operator` (`operator_id`),
  ADD KEY `fk_outbound_order_created_by` (`created_by`),
  ADD KEY `fk_outbound_order_updated_by` (`updated_by`),
  ADD KEY `idx_outbound_order_cancelled_by` (`cancelled_by`),
  ADD CONSTRAINT `chk_outbound_order_cancel_source` CHECK (((`cancel_source` is null) or (`cancel_source` in (_utf8mb4'manual',_utf8mb4'production_batch',_utf8mb4'production_termination')))),
  ADD CONSTRAINT `chk_outbound_order_status` CHECK ((`status` in (_utf8mb4'pending_picking',_utf8mb4'picked',_utf8mb4'partially_outbound',_utf8mb4'completed',_utf8mb4'cancelled'))),
  ADD CONSTRAINT `chk_outbound_order_version` CHECK ((`version` >= 0));

ALTER TABLE outbound_detail
  ADD UNIQUE KEY `uk_outbound_detail_order_allocation` (`outbound_id`,`allocation_id`),
  ADD KEY `idx_outbound_detail_demand` (`demand_id`,`created_at`),
  ADD KEY `idx_outbound_detail_allocation` (`allocation_id`,`created_at`),
  ADD KEY `fk_outbound_detail_order_batch` (`outbound_id`,`production_batch_id`),
  ADD KEY `fk_outbound_detail_demand_batch` (`demand_id`,`production_batch_id`),
  ADD KEY `fk_outbound_detail_created_by` (`created_by`),
  ADD KEY `fk_outbound_detail_allocation_variant` (`allocation_id`,`demand_id`,`production_batch_id`,`item_id`,`batch_id`,`material_variant_id`),
  ADD KEY `fk_outbound_detail_batch_variant` (`batch_id`,`item_id`,`material_variant_id`),
  ADD CONSTRAINT `chk_integer_storage_outbound_detail` CHECK ((`outbound_number` between 0 and 99999999)),
  ADD CONSTRAINT `chk_outbound_detail_quantity` CHECK ((`outbound_number` > 0)),
  ADD CONSTRAINT `chk_outbound_detail_quantity_integer` CHECK ((`outbound_number` = truncate(`outbound_number`,0)));

ALTER TABLE inventory_transaction
  ADD UNIQUE KEY `uk_inventory_transaction_idempotency` (`idempotency_key`),
  ADD UNIQUE KEY `uk_inventory_transaction_reversal` (`reversal_of_transaction_id`),
  ADD UNIQUE KEY `uk_inventory_transaction_finished_once` (`product_id`,`reference_type`,`reference_detail_id`,`transaction_type`),
  ADD KEY `idx_inventory_transaction_group` (`transaction_group_key`),
  ADD KEY `idx_inventory_transaction_stock` (`item_id`,`batch_id`,`stock_status`,`created_at`),
  ADD KEY `idx_inventory_transaction_reference` (`reference_type`,`reference_detail_id`),
  ADD KEY `fk_inventory_transaction_created_by` (`created_by`),
  ADD KEY `idx_inventory_transaction_product_stock` (`product_id`,`batch_id`,`stock_status`,`created_at`),
  ADD KEY `idx_inventory_transaction_batch_product` (`batch_id`,`product_id`),
  ADD KEY `idx_inventory_transaction_finished_detail` (`reference_detail_id`,`product_id`,`batch_id`),
  ADD KEY `fk_inventory_transaction_batch_variant` (`batch_id`,`item_id`,`material_variant_id`),
  ADD CONSTRAINT `chk_integer_storage_inventory_transaction` CHECK ((`quantity` between -(99999999) and 99999999)),
  ADD CONSTRAINT `chk_inventory_transaction_finished_scope` CHECK (((`product_id` is null) or ((`transaction_type` = _utf8mb4'production_inbound') and (`reference_type` = _utf8mb4'inbound_detail') and (`quantity` > 0) and (`stock_status` = _utf8mb4'available') and (`reversal_of_transaction_id` is null) and (`transaction_group_key` is null)))),
  ADD CONSTRAINT `chk_inventory_transaction_identity` CHECK ((((`product_id` is null) and (`item_id` is not null) and (`material_variant_id` is not null)) or ((`product_id` is not null) and (`item_id` is null) and (`material_variant_id` is null)))),
  ADD CONSTRAINT `chk_inventory_transaction_quantity` CHECK ((`quantity` <> 0)),
  ADD CONSTRAINT `chk_inventory_transaction_quantity_integer` CHECK ((`quantity` = truncate(`quantity`,0))),
  ADD CONSTRAINT `chk_inventory_transaction_stock_status` CHECK ((`stock_status` in (_utf8mb4'available',_utf8mb4'pending_inspection',_utf8mb4'frozen',_utf8mb4'defective'))),
  ADD CONSTRAINT `chk_inventory_transaction_type` CHECK ((`transaction_type` in (_utf8mb4'purchase_inbound',_utf8mb4'production_inbound',_utf8mb4'outsourced_inbound',_utf8mb4'production_material_outbound',_utf8mb4'sales_outbound',_utf8mb4'material_return_inbound',_utf8mb4'scrap_outbound',_utf8mb4'stock_check_adjustment',_utf8mb4'status_transfer_in',_utf8mb4'status_transfer_out')));

ALTER TABLE inbound_order
  ADD CONSTRAINT `fk_inbound_order_batch_work_order` FOREIGN KEY (`production_batch_id`, `work_order_id`) REFERENCES `production_batches` (`id`, `work_order_id`),
  ADD CONSTRAINT `fk_inbound_order_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_inbound_order_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_inbound_order_operator` FOREIGN KEY (`operator_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_inbound_order_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_inbound_order_work_order` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`);

ALTER TABLE inbound_detail
  ADD CONSTRAINT `fk_inbound_detail_allocation` FOREIGN KEY (`procurement_allocation_id`, `procurement_receipt_line_id`) REFERENCES `procurement_receipt_allocation` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_inbound_detail_batch_item` FOREIGN KEY (`batch_id`, `item_id`) REFERENCES `item_batch` (`id`, `item_id`),
  ADD CONSTRAINT `fk_inbound_detail_batch_product` FOREIGN KEY (`batch_id`, `product_id`) REFERENCES `item_batch` (`id`, `product_id`),
  ADD CONSTRAINT `fk_inbound_detail_batch_variant` FOREIGN KEY (`batch_id`, `item_id`, `material_variant_id`) REFERENCES `item_batch` (`id`, `item_id`, `material_variant_id`),
  ADD CONSTRAINT `fk_inbound_detail_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_inbound_detail_finished_order` FOREIGN KEY (`inbound_id`, `product_id`) REFERENCES `inbound_order` (`id`, `product_id`),
  ADD CONSTRAINT `fk_inbound_detail_item` FOREIGN KEY (`item_id`) REFERENCES `materials` (`id`),
  ADD CONSTRAINT `fk_inbound_detail_order` FOREIGN KEY (`inbound_id`) REFERENCES `inbound_order` (`id`),
  ADD CONSTRAINT `fk_inbound_detail_output_allocation` FOREIGN KEY (`production_output_allocation_id`) REFERENCES `production_output_allocation` (`id`),
  ADD CONSTRAINT `fk_inbound_detail_procurement_inspection` FOREIGN KEY (`procurement_inspection_id`, `procurement_receipt_line_id`) REFERENCES `quality_inspection_record` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_inbound_detail_procurement_material` FOREIGN KEY (`procurement_receipt_line_id`, `item_id`, `material_variant_id`) REFERENCES `procurement_receipt_line` (`id`, `item_id`, `material_variant_id`),
  ADD CONSTRAINT `fk_inbound_detail_procurement_revision` FOREIGN KEY (`procurement_receipt_revision_id`, `procurement_receipt_line_id`) REFERENCES `procurement_receipt_revision` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_inbound_detail_variant` FOREIGN KEY (`material_variant_id`, `item_id`) REFERENCES `material_variants` (`id`, `material_id`);

ALTER TABLE outbound_order
  ADD CONSTRAINT `fk_outbound_order_batch_work_order` FOREIGN KEY (`production_batch_id`, `work_order_id`) REFERENCES `production_batches` (`id`, `work_order_id`),
  ADD CONSTRAINT `fk_outbound_order_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_outbound_order_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_outbound_order_operator` FOREIGN KEY (`operator_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_outbound_order_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE outbound_detail
  ADD CONSTRAINT `fk_outbound_detail_allocation` FOREIGN KEY (`allocation_id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`) REFERENCES `production_item_allocation` (`id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`),
  ADD CONSTRAINT `fk_outbound_detail_allocation_variant` FOREIGN KEY (`allocation_id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`, `material_variant_id`) REFERENCES `production_item_allocation` (`id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`, `material_variant_id`),
  ADD CONSTRAINT `fk_outbound_detail_batch_variant` FOREIGN KEY (`batch_id`, `item_id`, `material_variant_id`) REFERENCES `item_batch` (`id`, `item_id`, `material_variant_id`),
  ADD CONSTRAINT `fk_outbound_detail_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_outbound_detail_demand_batch` FOREIGN KEY (`demand_id`, `production_batch_id`) REFERENCES `production_item_demand` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_outbound_detail_order_batch` FOREIGN KEY (`outbound_id`, `production_batch_id`) REFERENCES `outbound_order` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_outbound_detail_stock_batch` FOREIGN KEY (`batch_id`, `item_id`) REFERENCES `item_batch` (`id`, `item_id`);

ALTER TABLE inventory_transaction
  ADD CONSTRAINT `fk_inventory_transaction_batch_item` FOREIGN KEY (`batch_id`, `item_id`) REFERENCES `item_batch` (`id`, `item_id`),
  ADD CONSTRAINT `fk_inventory_transaction_batch_product` FOREIGN KEY (`batch_id`, `product_id`) REFERENCES `item_batch` (`id`, `product_id`),
  ADD CONSTRAINT `fk_inventory_transaction_batch_variant` FOREIGN KEY (`batch_id`, `item_id`, `material_variant_id`) REFERENCES `item_batch` (`id`, `item_id`, `material_variant_id`),
  ADD CONSTRAINT `fk_inventory_transaction_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_inventory_transaction_finished_detail` FOREIGN KEY (`reference_detail_id`, `product_id`, `batch_id`) REFERENCES `inbound_detail` (`id`, `product_id`, `batch_id`),
  ADD CONSTRAINT `fk_inventory_transaction_item` FOREIGN KEY (`item_id`) REFERENCES `materials` (`id`),
  ADD CONSTRAINT `fk_inventory_transaction_reversal` FOREIGN KEY (`reversal_of_transaction_id`) REFERENCES `inventory_transaction` (`id`);

CREATE TABLE `return_order` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `return_no` varchar(100) NOT NULL,
  `production_batch_id` bigint unsigned NOT NULL,
  `work_order_id` bigint unsigned NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'pending',
  `return_at` datetime DEFAULT NULL,
  `operator_id` bigint unsigned DEFAULT NULL,
  `version` int NOT NULL DEFAULT '0',
  `remark` text,
  `cancel_reason` text,
  `cancelled_by` bigint unsigned DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `created_by` bigint unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` bigint unsigned NOT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_return_order_no` (`return_no`),
  UNIQUE KEY `uk_return_order_id_batch` (`id`,`production_batch_id`),
  KEY `idx_return_order_status_created` (`status`,`created_at`),
  KEY `idx_return_order_batch_created` (`production_batch_id`,`created_at`),
  KEY `fk_return_order_batch_work_order` (`production_batch_id`,`work_order_id`),
  KEY `fk_return_order_operator` (`operator_id`),
  KEY `fk_return_order_created_by` (`created_by`),
  KEY `fk_return_order_updated_by` (`updated_by`),
  KEY `idx_return_order_cancelled_by` (`cancelled_by`),
  CONSTRAINT `fk_return_order_batch_work_order` FOREIGN KEY (`production_batch_id`, `work_order_id`) REFERENCES `production_batches` (`id`, `work_order_id`),
  CONSTRAINT `fk_return_order_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_return_order_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_return_order_operator` FOREIGN KEY (`operator_id`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_return_order_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_return_order_state` CHECK ((((`status` = _utf8mb4'pending') and (`return_at` is null) and (`operator_id` is null)) or ((`status` = _utf8mb4'returned') and (`return_at` is not null) and (`operator_id` is not null)) or ((`status` in (_utf8mb4'scrapped',_utf8mb4'cancelled')) and (`return_at` is null)))),
  CONSTRAINT `chk_return_order_status` CHECK ((`status` in (_utf8mb4'pending',_utf8mb4'returned',_utf8mb4'scrapped',_utf8mb4'cancelled'))),
  CONSTRAINT `chk_return_order_version` CHECK ((`version` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `return_detail` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `return_id` bigint unsigned NOT NULL,
  `production_batch_id` bigint unsigned NOT NULL,
  `demand_id` bigint unsigned NOT NULL,
  `allocation_id` bigint unsigned NOT NULL,
  `item_id` bigint unsigned NOT NULL,
  `material_variant_id` bigint unsigned NOT NULL,
  `batch_id` bigint unsigned NOT NULL,
  `return_number` int NOT NULL,
  `unit_snapshot` varchar(20) NOT NULL,
  `return_stock_status` varchar(20) NOT NULL DEFAULT 'available',
  `release_after_return` tinyint NOT NULL DEFAULT '1',
  `remark` text,
  `created_by` bigint unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_return_detail_order_allocation` (`return_id`,`allocation_id`),
  UNIQUE KEY `uk_return_detail_source` (`id`,`allocation_id`,`demand_id`,`production_batch_id`,`item_id`,`batch_id`),
  KEY `idx_return_detail_allocation` (`allocation_id`,`created_at`),
  KEY `idx_return_detail_stock_batch` (`batch_id`,`created_at`),
  KEY `fk_return_detail_order_batch` (`return_id`,`production_batch_id`),
  KEY `fk_return_detail_demand_batch` (`demand_id`,`production_batch_id`),
  KEY `fk_return_detail_created_by` (`created_by`),
  KEY `fk_return_detail_allocation_variant` (`allocation_id`,`demand_id`,`production_batch_id`,`item_id`,`batch_id`,`material_variant_id`),
  KEY `fk_return_detail_batch_variant` (`batch_id`,`item_id`,`material_variant_id`),
  CONSTRAINT `fk_return_detail_allocation` FOREIGN KEY (`allocation_id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`) REFERENCES `production_item_allocation` (`id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`),
  CONSTRAINT `fk_return_detail_allocation_variant` FOREIGN KEY (`allocation_id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`, `material_variant_id`) REFERENCES `production_item_allocation` (`id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`, `material_variant_id`),
  CONSTRAINT `fk_return_detail_batch_variant` FOREIGN KEY (`batch_id`, `item_id`, `material_variant_id`) REFERENCES `item_batch` (`id`, `item_id`, `material_variant_id`),
  CONSTRAINT `fk_return_detail_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_return_detail_demand_batch` FOREIGN KEY (`demand_id`, `production_batch_id`) REFERENCES `production_item_demand` (`id`, `production_batch_id`),
  CONSTRAINT `fk_return_detail_order_batch` FOREIGN KEY (`return_id`, `production_batch_id`) REFERENCES `return_order` (`id`, `production_batch_id`),
  CONSTRAINT `fk_return_detail_stock_batch` FOREIGN KEY (`batch_id`, `item_id`) REFERENCES `item_batch` (`id`, `item_id`),
  CONSTRAINT `chk_integer_storage_return_detail` CHECK ((`return_number` between 0 and 99999999)),
  CONSTRAINT `chk_return_detail_current_scope` CHECK (((`return_stock_status` = _utf8mb4'available') and (`release_after_return` = 1))),
  CONSTRAINT `chk_return_detail_quantity` CHECK ((`return_number` > 0)),
  CONSTRAINT `chk_return_detail_quantity_integer` CHECK ((`return_number` = truncate(`return_number`,0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TRIGGER trg_finished_inbound_detail_insert BEFORE INSERT ON inbound_detail FOR EACH ROW
BEGIN
  DECLARE parent_product BIGINT UNSIGNED;
  DECLARE parent_batch BIGINT UNSIGNED;
  DECLARE parent_status VARCHAR(30);
  DECLARE parent_source VARCHAR(30);
  SELECT product_id,production_batch_id,status,source_type INTO parent_product,parent_batch,parent_status,parent_source
  FROM inbound_order WHERE id=NEW.inbound_id;
  IF NOT(NEW.product_id <=> parent_product) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound detail identity must match its order';
  END IF;
  IF NEW.product_id IS NOT NULL AND (parent_status<>'pending' OR parent_source<>'finished_product' OR NOT EXISTS(
    SELECT 1 FROM production_output_allocation a JOIN production_output_revision r ON r.id=a.revision_id
    WHERE a.id=NEW.production_output_allocation_id AND r.production_batch_id=parent_batch AND r.product_id=NEW.product_id
  )) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished detail requires a matching output allocation'; END IF;
END;

CREATE TRIGGER trg_finished_inbound_detail_update BEFORE UPDATE ON inbound_detail FOR EACH ROW
BEGIN
  IF OLD.product_id IS NOT NULL OR NEW.product_id IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished inbound detail is immutable';
  END IF;
END;

CREATE TRIGGER trg_finished_inbound_detail_delete BEFORE DELETE ON inbound_detail FOR EACH ROW
BEGIN
  IF OLD.product_id IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished inbound detail is immutable'; END IF;
END;

CREATE TRIGGER trg_finished_inbound_order_insert BEFORE INSERT ON inbound_order FOR EACH ROW
BEGIN
  IF NEW.product_id IS NOT NULL AND (NEW.source_type<>'finished_product' OR NEW.status<>'pending') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished inbound starts pending with neutral source type';
  END IF;
END;

CREATE TRIGGER trg_finished_inbound_order_update BEFORE UPDATE ON inbound_order FOR EACH ROW
BEGIN
  DECLARE total_details BIGINT DEFAULT 0;
  DECLARE matched_details BIGINT DEFAULT 0;
  IF OLD.product_id IS NOT NULL OR NEW.product_id IS NOT NULL THEN
    IF OLD.status<>'pending' OR NOT(NEW.product_id <=> OLD.product_id) OR NOT(NEW.source_type <=> OLD.source_type)
      OR NOT(NEW.production_batch_id <=> OLD.production_batch_id) OR NOT(NEW.work_order_id <=> OLD.work_order_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished order source and confirmed receipts are immutable';
    END IF;
    IF NEW.status='completed' THEN
      IF NEW.inbound_at IS NULL OR NEW.operator_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished receipt requires time and operator';
      END IF;
      SELECT COUNT(*) INTO total_details FROM inbound_detail WHERE inbound_id=NEW.id;
      SELECT COUNT(*) INTO matched_details FROM inbound_detail d JOIN item_batch b ON b.id=d.batch_id
        JOIN production_output_allocation a ON a.id=d.production_output_allocation_id
        JOIN production_output_revision r ON r.id=a.revision_id
        JOIN inventory_transaction t ON t.reference_type='inbound_detail' AND t.reference_detail_id=d.id
          AND t.transaction_type='production_inbound' AND t.product_id=d.product_id AND t.batch_id=d.batch_id
          AND t.quantity=d.inbound_number AND t.unit_snapshot=d.unit_snapshot AND t.stock_status=d.stock_status
        WHERE d.inbound_id=NEW.id AND d.product_id=NEW.product_id AND d.inbound_number>0
          AND r.production_batch_id=NEW.production_batch_id AND r.work_order_id=NEW.work_order_id
          AND r.product_id=NEW.product_id AND b.product_id=d.product_id AND b.batch_status='available'
          AND b.unit_snapshot=d.unit_snapshot;
      IF total_details=0 OR matched_details<>total_details THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='All finished details require matching allocations, batches and positive ledger facts';
      END IF;
    END IF;
  END IF;
END;

CREATE TRIGGER trg_finished_inventory_transaction_insert BEFORE INSERT ON inventory_transaction FOR EACH ROW
BEGIN
  IF NEW.product_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM inbound_detail d JOIN inbound_order o ON o.id=d.inbound_id JOIN item_batch b ON b.id=d.batch_id
    WHERE d.id=NEW.reference_detail_id AND d.product_id=NEW.product_id AND d.batch_id=NEW.batch_id
      AND o.status='pending' AND o.source_type='finished_product' AND o.product_id=d.product_id
      AND d.inbound_number=NEW.quantity AND d.unit_snapshot=NEW.unit_snapshot AND d.stock_status=NEW.stock_status
      AND b.product_id=d.product_id AND b.unit_snapshot=d.unit_snapshot AND b.batch_status='available' AND b.source_type='finished_product'
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished ledger entry must match one pending detail and target batch'; END IF;
END;

-- Remove only this migration's new catalog entries; never reconstruct role grants.
DELETE rp FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
WHERE p.code IN ('warehouse:other-inbounds:view','warehouse:other-inbounds:create','warehouse:other-inbounds:update','warehouse:other-inbounds:confirm','warehouse:other-inbounds:cancel','warehouse:other-outbounds:view','warehouse:other-outbounds:create','warehouse:other-outbounds:update','warehouse:other-outbounds:confirm','warehouse:other-outbounds:cancel');
DELETE FROM permissions WHERE code IN ('warehouse:other-inbounds:create','warehouse:other-inbounds:update','warehouse:other-inbounds:confirm','warehouse:other-inbounds:cancel','warehouse:other-outbounds:create','warehouse:other-outbounds:update','warehouse:other-outbounds:confirm','warehouse:other-outbounds:cancel');
DELETE FROM permissions WHERE code IN ('warehouse:other-inbounds:view','warehouse:other-outbounds:view');
