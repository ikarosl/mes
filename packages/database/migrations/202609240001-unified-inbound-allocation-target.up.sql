-- Development cutover. Existing business facts cannot be truthfully reclassified as allocation receipts.
CREATE TEMPORARY TABLE guard_unified_inbound_empty (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_unified_inbound_empty SELECT IF(
  EXISTS(SELECT 1 FROM inbound_order) OR EXISTS(SELECT 1 FROM inbound_detail)
  OR EXISTS(SELECT 1 FROM inventory_transaction) OR EXISTS(SELECT 1 FROM item_batch)
  OR EXISTS(SELECT 1 FROM procurement_receipt_line) OR EXISTS(SELECT 1 FROM production_output_revision)
  OR EXISTS(SELECT 1 FROM quality_inspection_case) OR EXISTS(SELECT 1 FROM production_batch_closeout),0,1);
DROP TEMPORARY TABLE guard_unified_inbound_empty;

DROP TRIGGER trg_finished_inbound_order_insert;
DROP TRIGGER trg_finished_inbound_detail_insert;
DROP TRIGGER trg_finished_inbound_detail_update;
DROP TRIGGER trg_finished_inbound_detail_delete;
DROP TRIGGER trg_finished_inventory_transaction_insert;
DROP TRIGGER trg_finished_inbound_order_update;
DROP TRIGGER trg_item_batch_reject_material_identity_update;
DROP TRIGGER trg_procurement_receipt_batch_bind;

ALTER TABLE procurement_receipt_line DROP FOREIGN KEY fk_procurement_receipt_line_batch,
  DROP INDEX uk_procurement_receipt_line_batch, DROP COLUMN batch_id;
CREATE TRIGGER trg_procurement_receipt_identity_update BEFORE UPDATE ON procurement_receipt_line FOR EACH ROW
BEGIN
  IF NOT (NEW.receipt_id <=> OLD.receipt_id) OR NOT (NEW.purchase_order_id <=> OLD.purchase_order_id)
    OR NOT (NEW.purchase_order_line_id <=> OLD.purchase_order_line_id) OR NOT (NEW.item_id <=> OLD.item_id)
    OR NOT (NEW.material_variant_id <=> OLD.material_variant_id) OR NOT (NEW.supplier_batch_code <=> OLD.supplier_batch_code) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt source identity cannot change';
  END IF;
END;

CREATE TABLE production_output_round (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  closeout_id BIGINT UNSIGNED NOT NULL,
  round_no INT NOT NULL,
  previous_round_id BIGINT UNSIGNED NULL,
  trigger_type VARCHAR(30) NOT NULL,
  base_revision_id BIGINT UNSIGNED NULL,
  source_version INT NOT NULL,
  baseline_planned_received INT NOT NULL,
  baseline_extra_received INT NOT NULL,
  starting_declared_remaining INT NOT NULL,
  status VARCHAR(30) NOT NULL,
  reason TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_output_round_no(closeout_id,round_no),
  UNIQUE KEY uk_output_round_closeout(id,closeout_id),
  KEY idx_output_round_status(closeout_id,status,id),
  CONSTRAINT fk_output_round_closeout FOREIGN KEY(closeout_id) REFERENCES production_batch_closeout(id),
  CONSTRAINT fk_output_round_previous FOREIGN KEY(previous_round_id,closeout_id) REFERENCES production_output_round(id,closeout_id),
  CONSTRAINT fk_output_round_base FOREIGN KEY(base_revision_id,closeout_id) REFERENCES production_output_revision(id,closeout_id),
  CONSTRAINT fk_output_round_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_output_round_updater FOREIGN KEY(updated_by) REFERENCES users(id),
  CONSTRAINT chk_output_round_no CHECK(round_no>0 AND source_version>=0 AND version>=0),
  CONSTRAINT chk_output_round_trigger CHECK(trigger_type IN('initial','reinspection','finalization_correction')),
  CONSTRAINT chk_output_round_status CHECK(status IN('pending_inspection','inspecting','pending_finalization','reviewing','finalized','superseded')),
  CONSTRAINT chk_output_round_quantities CHECK(baseline_planned_received BETWEEN 0 AND 99999999 AND baseline_extra_received BETWEEN 0 AND 99999999 AND starting_declared_remaining BETWEEN 0 AND 99999999),
  CONSTRAINT chk_output_round_lineage CHECK((round_no=1 AND previous_round_id IS NULL AND base_revision_id IS NULL) OR (round_no>1 AND previous_round_id IS NOT NULL)),
  CONSTRAINT chk_output_round_reason CHECK(reason IS NULL OR CHAR_LENGTH(TRIM(reason))>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TRIGGER trg_output_round_identity_update BEFORE UPDATE ON production_output_round FOR EACH ROW
BEGIN
  IF NOT(NEW.closeout_id <=> OLD.closeout_id) OR NOT(NEW.round_no <=> OLD.round_no)
    OR NOT(NEW.previous_round_id <=> OLD.previous_round_id) OR NOT(NEW.trigger_type <=> OLD.trigger_type)
    OR NOT(NEW.base_revision_id <=> OLD.base_revision_id) OR NOT(NEW.source_version <=> OLD.source_version)
    OR NOT(NEW.baseline_planned_received <=> OLD.baseline_planned_received)
    OR NOT(NEW.baseline_extra_received <=> OLD.baseline_extra_received)
    OR NOT(NEW.starting_declared_remaining <=> OLD.starting_declared_remaining)
    OR NOT(NEW.created_by <=> OLD.created_by) OR NOT(NEW.created_at <=> OLD.created_at) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Output round identity and baseline are immutable';
  END IF;
END;
ALTER TABLE production_batch_closeout ADD COLUMN current_round_id BIGINT UNSIGNED NULL AFTER current_revision_id,
  ADD CONSTRAINT fk_closeout_current_round FOREIGN KEY(current_round_id,id) REFERENCES production_output_round(id,closeout_id);
ALTER TABLE production_output_revision DROP CHECK chk_output_revision_quantities,
  ADD COLUMN round_id BIGINT UNSIGNED NOT NULL AFTER closeout_id,
  DROP COLUMN available_quantity, DROP COLUMN extra_quantity,
  ADD UNIQUE KEY uk_output_revision_round(round_id),
  ADD UNIQUE KEY uk_output_revision_round_closeout(id,round_id,closeout_id),
  ADD CONSTRAINT fk_output_revision_round FOREIGN KEY(round_id,closeout_id) REFERENCES production_output_round(id,closeout_id),
  ADD CONSTRAINT chk_output_revision_quantities CHECK(planned_quantity>0 AND planned_quantity<=99999999 AND additional_scrap_quantity<=99999999);
CREATE TABLE production_output_allocation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  revision_id BIGINT UNSIGNED NOT NULL,
  round_id BIGINT UNSIGNED NOT NULL,
  closeout_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(30) NOT NULL,
  quantity INT NOT NULL,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_output_allocation_category(revision_id,category),
  UNIQUE KEY uk_output_allocation_source(id,revision_id,closeout_id,category),
  KEY idx_output_allocation_round(round_id,closeout_id,id),
  CONSTRAINT fk_output_allocation_revision FOREIGN KEY(revision_id,round_id,closeout_id) REFERENCES production_output_revision(id,round_id,closeout_id),
  CONSTRAINT fk_output_allocation_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT chk_output_allocation_category CHECK(category IN('self_made','production_extra')),
  CONSTRAINT chk_output_allocation_quantity CHECK(quantity BETWEEN 1 AND 99999999),
  CONSTRAINT chk_output_allocation_remark CHECK(remark IS NULL OR CHAR_LENGTH(TRIM(remark))>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TRIGGER trg_output_allocation_no_update BEFORE UPDATE ON production_output_allocation FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Output allocations are immutable';
CREATE TRIGGER trg_output_allocation_no_delete BEFORE DELETE ON production_output_allocation FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Output allocations are immutable';

ALTER TABLE quality_inspection_case DROP CHECK chk_quality_case_source,
  ADD COLUMN finished_round_id BIGINT UNSIGNED NULL AFTER production_batch_id,
  ADD UNIQUE KEY uk_quality_case_finished_round(finished_round_id),
  ADD CONSTRAINT fk_quality_case_finished_round FOREIGN KEY(finished_round_id,closeout_id) REFERENCES production_output_round(id,closeout_id),
  ADD CONSTRAINT chk_quality_case_source CHECK(
    (source_kind='incoming' AND receipt_line_id IS NOT NULL AND receipt_revision_id IS NOT NULL
      AND incoming_round_id IS NOT NULL AND finished_round_id IS NULL
      AND closeout_id IS NULL AND production_batch_id IS NULL AND declared_version IS NULL
      AND declared_available_quantity IS NULL AND declared_extra_quantity IS NULL AND declared_scrap_quantity IS NULL
      AND declared_quantity>0)
    OR (source_kind='finished' AND closeout_id IS NOT NULL AND production_batch_id IS NOT NULL AND finished_round_id IS NOT NULL
      AND receipt_line_id IS NULL AND receipt_revision_id IS NULL AND incoming_round_id IS NULL
      AND superseded_by_round_id IS NULL AND superseded_reason IS NULL
      AND declared_version IS NOT NULL AND declared_version>=0
      AND declared_available_quantity BETWEEN 0 AND 99999999 AND declared_extra_quantity BETWEEN 0 AND 99999999
      AND declared_scrap_quantity BETWEEN 0 AND 99999999
      AND declared_quantity=declared_available_quantity+declared_extra_quantity));

ALTER TABLE inbound_order DROP FOREIGN KEY fk_inbound_order_output_source,
  DROP CHECK chk_inbound_order_finished_identity, DROP CHECK chk_inbound_order_source_type,
  DROP INDEX uk_inbound_order_finished_once, DROP INDEX idx_inbound_order_output_source,
  DROP COLUMN active_finished_slot, DROP COLUMN output_revision_id,
  ADD CONSTRAINT chk_inbound_order_source_type CHECK(source_type IN('finished_product','self_made','production_extra','purchased','outsourced','return_inbound','stock_check_generated','other')),
  ADD CONSTRAINT chk_inbound_order_finished_identity CHECK(
    (source_type='finished_product' AND product_id IS NOT NULL AND production_batch_id IS NOT NULL AND work_order_id IS NOT NULL AND provider IS NULL)
    OR (source_type<>'finished_product' AND product_id IS NULL));
ALTER TABLE item_batch DROP CHECK chk_item_batch_identity, DROP CHECK chk_item_batch_source_type,
  ADD CONSTRAINT chk_item_batch_source_type CHECK(source_type IN('finished_product','self_made','production_extra','purchased','outsourced','return_inbound','stock_check_generated','other')),
  ADD CONSTRAINT chk_item_batch_identity CHECK(
    (product_id IS NULL AND item_id IS NOT NULL AND material_variant_id IS NOT NULL AND material_variant_code_snapshot IS NOT NULL AND source_type<>'finished_product')
    OR (product_id IS NOT NULL AND item_id IS NULL AND material_variant_id IS NULL AND material_variant_code_snapshot IS NULL
      AND source_type='finished_product' AND provider IS NULL AND source_work_order_id IS NULL AND source_production_batch_id IS NULL));
CREATE TRIGGER trg_item_batch_reject_material_identity_update BEFORE UPDATE ON item_batch FOR EACH ROW
BEGIN
  IF NOT(NEW.item_id <=> OLD.item_id) OR NOT(NEW.material_variant_id <=> OLD.material_variant_id)
    OR NOT(NEW.product_id <=> OLD.product_id) OR NOT(NEW.material_variant_code_snapshot <=> OLD.material_variant_code_snapshot)
    OR NOT(NEW.source_type <=> OLD.source_type) OR NOT(NEW.batch_code <=> OLD.batch_code)
    OR NOT(NEW.item_code_snapshot <=> OLD.item_code_snapshot) OR NOT(NEW.unit_snapshot <=> OLD.unit_snapshot)
    OR NOT(NEW.provider <=> OLD.provider) OR NOT(NEW.source_work_order_id <=> OLD.source_work_order_id)
    OR NOT(NEW.source_production_batch_id <=> OLD.source_production_batch_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory batch identity is immutable';
  END IF;
END;

ALTER TABLE inbound_detail ADD KEY idx_inbound_detail_order_product(inbound_id,product_id);
ALTER TABLE inventory_transaction DROP FOREIGN KEY fk_inventory_transaction_finished_detail;
ALTER TABLE inbound_detail DROP FOREIGN KEY fk_inbound_detail_batch_item, DROP FOREIGN KEY fk_inbound_detail_batch_product, DROP FOREIGN KEY fk_inbound_detail_batch_variant;
ALTER TABLE inbound_detail DROP CHECK chk_inbound_detail_identity,
  DROP CHECK chk_inbound_detail_procurement_source,
  DROP INDEX uk_inbound_detail_order_product,
  DROP COLUMN requested_batch_code,
  MODIFY COLUMN batch_id BIGINT UNSIGNED NOT NULL,
  ADD COLUMN production_output_allocation_id BIGINT UNSIGNED NULL AFTER product_id,
  ADD KEY idx_inbound_detail_output_allocation(production_output_allocation_id,id),
  ADD CONSTRAINT fk_inbound_detail_output_allocation FOREIGN KEY(production_output_allocation_id) REFERENCES production_output_allocation(id),
  ADD CONSTRAINT chk_inbound_detail_identity CHECK(
    (product_id IS NULL AND item_id IS NOT NULL AND material_variant_id IS NOT NULL AND production_output_allocation_id IS NULL)
    OR (product_id IS NOT NULL AND item_id IS NULL AND material_variant_id IS NULL AND production_output_allocation_id IS NOT NULL AND stock_status='available')),
  ADD CONSTRAINT chk_inbound_detail_procurement_source CHECK(
    (procurement_receipt_line_id IS NULL AND procurement_receipt_revision_id IS NULL AND procurement_allocation_id IS NULL AND procurement_inspection_id IS NULL)
    OR (product_id IS NULL AND procurement_receipt_line_id IS NOT NULL AND procurement_receipt_revision_id IS NOT NULL AND procurement_allocation_id IS NOT NULL AND procurement_inspection_id IS NOT NULL));

ALTER TABLE inbound_detail ADD CONSTRAINT fk_inbound_detail_batch_item FOREIGN KEY(batch_id,item_id) REFERENCES item_batch(id,item_id),
  ADD CONSTRAINT fk_inbound_detail_batch_product FOREIGN KEY(batch_id,product_id) REFERENCES item_batch(id,product_id),
  ADD CONSTRAINT fk_inbound_detail_batch_variant FOREIGN KEY(batch_id,item_id,material_variant_id) REFERENCES item_batch(id,item_id,material_variant_id);
ALTER TABLE inventory_transaction ADD CONSTRAINT fk_inventory_transaction_finished_detail FOREIGN KEY(reference_detail_id,product_id,batch_id) REFERENCES inbound_detail(id,product_id,batch_id);
CREATE TRIGGER trg_finished_inbound_order_insert BEFORE INSERT ON inbound_order FOR EACH ROW
BEGIN
  IF NEW.product_id IS NOT NULL AND (NEW.source_type<>'finished_product' OR NEW.status<>'pending') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished inbound starts pending with neutral source type';
  END IF;
END;
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

DELETE FROM permissions WHERE code IN('production:inbounds:create-finished','production:inbounds:cancel-finished');
UPDATE permissions SET api_path='/api/production/finished-goods-inbounds/actions/confirm' WHERE code='production:inbounds:confirm-finished';
