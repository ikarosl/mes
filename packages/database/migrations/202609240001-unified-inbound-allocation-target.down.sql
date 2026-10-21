-- Rollback requires an empty development cutover state; historical allocation facts are never guessed.
CREATE TEMPORARY TABLE guard_unified_inbound_rollback (ok TINYINT NOT NULL CHECK(ok=1));
INSERT INTO guard_unified_inbound_rollback SELECT IF(
  EXISTS(SELECT 1 FROM inbound_order) OR EXISTS(SELECT 1 FROM inbound_detail)
  OR EXISTS(SELECT 1 FROM inventory_transaction) OR EXISTS(SELECT 1 FROM item_batch)
  OR EXISTS(SELECT 1 FROM procurement_receipt_line) OR EXISTS(SELECT 1 FROM production_output_revision)
  OR EXISTS(SELECT 1 FROM quality_inspection_case) OR EXISTS(SELECT 1 FROM production_batch_closeout),0,1);
DROP TEMPORARY TABLE guard_unified_inbound_rollback;

DROP TRIGGER trg_finished_inbound_order_insert;
DROP TRIGGER trg_finished_inbound_detail_insert;
DROP TRIGGER trg_finished_inbound_detail_update;
DROP TRIGGER trg_finished_inbound_detail_delete;
DROP TRIGGER trg_finished_inventory_transaction_insert;
DROP TRIGGER trg_finished_inbound_order_update;
DROP TRIGGER trg_item_batch_reject_material_identity_update;
DROP TRIGGER trg_procurement_receipt_identity_update;
DROP TRIGGER trg_output_allocation_no_update;
DROP TRIGGER trg_output_allocation_no_delete;
DROP TRIGGER trg_output_round_identity_update;

ALTER TABLE inbound_detail DROP FOREIGN KEY fk_inbound_detail_output_allocation,
  DROP CHECK chk_inbound_detail_identity, DROP CHECK chk_inbound_detail_procurement_source,
  DROP INDEX idx_inbound_detail_output_allocation,
  DROP COLUMN production_output_allocation_id,
  MODIFY COLUMN batch_id BIGINT UNSIGNED NULL,
  ADD COLUMN requested_batch_code VARCHAR(100) NULL AFTER batch_id,
  ADD UNIQUE KEY uk_inbound_detail_order_product(inbound_id,product_id),
  ADD CONSTRAINT chk_inbound_detail_identity CHECK(
    (product_id IS NULL AND item_id IS NOT NULL AND material_variant_id IS NOT NULL AND batch_id IS NOT NULL AND requested_batch_code IS NULL)
    OR (product_id IS NOT NULL AND item_id IS NULL AND material_variant_id IS NULL AND requested_batch_code IS NOT NULL
      AND CHAR_LENGTH(TRIM(requested_batch_code))>0 AND stock_status='available')),
  ADD CONSTRAINT chk_inbound_detail_procurement_source CHECK(
    (procurement_receipt_line_id IS NULL AND procurement_receipt_revision_id IS NULL AND procurement_allocation_id IS NULL AND procurement_inspection_id IS NULL)
    OR (product_id IS NULL AND procurement_receipt_line_id IS NOT NULL AND procurement_receipt_revision_id IS NOT NULL AND procurement_allocation_id IS NOT NULL AND procurement_inspection_id IS NOT NULL));
ALTER TABLE inbound_detail DROP INDEX idx_inbound_detail_order_product;
ALTER TABLE inbound_detail ADD CONSTRAINT fk_inbound_detail_batch_item FOREIGN KEY(batch_id,item_id) REFERENCES item_batch(id,item_id),
  ADD CONSTRAINT fk_inbound_detail_batch_product FOREIGN KEY(batch_id,product_id) REFERENCES item_batch(id,product_id),
  ADD CONSTRAINT fk_inbound_detail_batch_variant FOREIGN KEY(batch_id,item_id,material_variant_id) REFERENCES item_batch(id,item_id,material_variant_id);
ALTER TABLE inventory_transaction ADD CONSTRAINT fk_inventory_transaction_finished_detail FOREIGN KEY(reference_detail_id,product_id,batch_id) REFERENCES inbound_detail(id,product_id,batch_id);
ALTER TABLE item_batch DROP CHECK chk_item_batch_identity, DROP CHECK chk_item_batch_source_type,
  ADD CONSTRAINT chk_item_batch_source_type CHECK(source_type IN('self_made','production_extra','purchased','outsourced','return_inbound','stock_check_generated','other')),
  ADD CONSTRAINT chk_item_batch_identity CHECK(
    (product_id IS NULL AND item_id IS NOT NULL AND material_variant_id IS NOT NULL AND material_variant_code_snapshot IS NOT NULL AND source_type NOT IN('self_made','production_extra'))
    OR (product_id IS NOT NULL AND item_id IS NULL AND material_variant_id IS NULL AND material_variant_code_snapshot IS NULL
      AND source_type IN('self_made','production_extra') AND source_work_order_id IS NOT NULL AND source_production_batch_id IS NOT NULL));
ALTER TABLE inbound_order DROP CHECK chk_inbound_order_finished_identity, DROP CHECK chk_inbound_order_source_type,
  ADD COLUMN output_revision_id BIGINT UNSIGNED NULL AFTER product_id,
  ADD COLUMN active_finished_slot TINYINT GENERATED ALWAYS AS
    (CASE WHEN source_type IN('self_made','production_extra') AND status IN('pending','completed') THEN 1 ELSE NULL END) STORED,
  ADD UNIQUE KEY uk_inbound_order_finished_once(production_batch_id,source_type,active_finished_slot),
  ADD KEY idx_inbound_order_output_source(output_revision_id,production_batch_id,work_order_id,product_id),
  ADD CONSTRAINT fk_inbound_order_output_source FOREIGN KEY(output_revision_id,production_batch_id,work_order_id,product_id)
    REFERENCES production_output_revision(id,production_batch_id,work_order_id,product_id),
  ADD CONSTRAINT chk_inbound_order_source_type CHECK(source_type IN('self_made','production_extra','purchased','outsourced','return_inbound','stock_check_generated','other')),
  ADD CONSTRAINT chk_inbound_order_finished_identity CHECK(
    (source_type IN('self_made','production_extra') AND product_id IS NOT NULL AND output_revision_id IS NOT NULL
      AND production_batch_id IS NOT NULL AND work_order_id IS NOT NULL AND provider IS NULL)
    OR (source_type NOT IN('self_made','production_extra') AND product_id IS NULL AND output_revision_id IS NULL));
ALTER TABLE quality_inspection_case DROP FOREIGN KEY fk_quality_case_finished_round,
  DROP CHECK chk_quality_case_source, DROP INDEX uk_quality_case_finished_round, DROP COLUMN finished_round_id,
  ADD CONSTRAINT chk_quality_case_source CHECK(
    (source_kind='incoming' AND receipt_line_id IS NOT NULL AND receipt_revision_id IS NOT NULL AND incoming_round_id IS NOT NULL
      AND closeout_id IS NULL AND production_batch_id IS NULL AND declared_version IS NULL
      AND declared_available_quantity IS NULL AND declared_extra_quantity IS NULL AND declared_scrap_quantity IS NULL AND declared_quantity>0)
    OR (source_kind='finished' AND closeout_id IS NOT NULL AND production_batch_id IS NOT NULL
      AND receipt_line_id IS NULL AND receipt_revision_id IS NULL AND incoming_round_id IS NULL
      AND superseded_by_round_id IS NULL AND superseded_reason IS NULL AND declared_version IS NOT NULL AND declared_version>=0
      AND declared_available_quantity BETWEEN 0 AND 99999999 AND declared_extra_quantity BETWEEN 0 AND 99999999
      AND declared_scrap_quantity BETWEEN 0 AND 99999999
      AND declared_quantity=declared_available_quantity+declared_extra_quantity));
DROP TABLE production_output_allocation;
ALTER TABLE production_output_revision DROP FOREIGN KEY fk_output_revision_round,
  DROP CHECK chk_output_revision_quantities,
  DROP INDEX uk_output_revision_round, DROP INDEX uk_output_revision_round_closeout,
  DROP COLUMN round_id,
  ADD COLUMN available_quantity BIGINT UNSIGNED NOT NULL AFTER planned_quantity,
  ADD COLUMN extra_quantity BIGINT UNSIGNED NOT NULL AFTER available_quantity,
  ADD CONSTRAINT chk_output_revision_quantities CHECK(
    planned_quantity>0 AND planned_quantity<=99999999 AND available_quantity<=planned_quantity
    AND extra_quantity<=99999999 AND additional_scrap_quantity<=99999999);
ALTER TABLE production_batch_closeout DROP FOREIGN KEY fk_closeout_current_round, DROP COLUMN current_round_id;
DROP TABLE production_output_round;
ALTER TABLE procurement_receipt_line ADD COLUMN batch_id BIGINT UNSIGNED NULL AFTER current_receipt_revision_id,
  ADD UNIQUE KEY uk_procurement_receipt_line_batch(batch_id),
  ADD CONSTRAINT fk_procurement_receipt_line_batch FOREIGN KEY(batch_id,item_id,material_variant_id) REFERENCES item_batch(id,item_id,material_variant_id);

CREATE TRIGGER trg_item_batch_reject_material_identity_update
BEFORE UPDATE ON item_batch
FOR EACH ROW
BEGIN
  IF NOT (NEW.item_id <=> OLD.item_id) OR NOT (NEW.material_variant_id <=> OLD.material_variant_id)
    OR NOT (NEW.product_id <=> OLD.product_id) OR NOT (NEW.material_variant_code_snapshot <=> OLD.material_variant_code_snapshot)
    OR (OLD.product_id IS NOT NULL AND (
      NOT (NEW.source_type <=> OLD.source_type) OR NOT (NEW.source_work_order_id <=> OLD.source_work_order_id)
      OR NOT (NEW.source_production_batch_id <=> OLD.source_production_batch_id) OR NOT (NEW.batch_code <=> OLD.batch_code)
      OR NOT (NEW.item_code_snapshot <=> OLD.item_code_snapshot) OR NOT (NEW.unit_snapshot <=> OLD.unit_snapshot))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory batch identity and finished output source are immutable';
  END IF;
END;

CREATE TRIGGER trg_finished_inbound_order_insert
BEFORE INSERT ON inbound_order
FOR EACH ROW
BEGIN
  IF NEW.product_id IS NOT NULL AND NEW.status<>'pending' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A finished-goods inbound starts as a pending order';
  END IF;
END;

CREATE TRIGGER trg_finished_inbound_detail_insert
BEFORE INSERT ON inbound_detail
FOR EACH ROW
BEGIN
  DECLARE parent_product BIGINT UNSIGNED;
  DECLARE parent_status VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  SELECT product_id,status INTO parent_product,parent_status FROM inbound_order WHERE id=NEW.inbound_id;
  IF NOT (NEW.product_id <=> parent_product) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound detail identity must match its order';
  END IF;
  IF NEW.product_id IS NOT NULL AND parent_status<>'pending' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished-goods details can only be created in pending orders';
  END IF;
END;

CREATE TRIGGER trg_finished_inbound_detail_update
BEFORE UPDATE ON inbound_detail
FOR EACH ROW
BEGIN
  DECLARE parent_status VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  IF OLD.product_id IS NOT NULL OR NEW.product_id IS NOT NULL THEN
    SELECT status INTO parent_status FROM inbound_order WHERE id=OLD.inbound_id;
    IF NOT (NEW.product_id <=> OLD.product_id) OR NEW.inbound_id<>OLD.inbound_id OR parent_status<>'pending' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished-goods detail identity and completed receipts are immutable';
    END IF;
  END IF;
END;

CREATE TRIGGER trg_finished_inbound_detail_delete
BEFORE DELETE ON inbound_detail
FOR EACH ROW
BEGIN
  DECLARE parent_status VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  IF OLD.product_id IS NOT NULL THEN
    SELECT status INTO parent_status FROM inbound_order WHERE id=OLD.inbound_id;
    IF parent_status<>'pending' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Keep finished-goods receipt and cancellation detail history';
    END IF;
  END IF;
END;

CREATE TRIGGER trg_finished_inventory_transaction_insert
BEFORE INSERT ON inventory_transaction
FOR EACH ROW
BEGIN
  IF NEW.product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM inbound_detail d
    JOIN inbound_order o ON o.id=d.inbound_id
    JOIN item_batch b ON b.id=d.batch_id
    WHERE d.id=NEW.reference_detail_id AND d.product_id=NEW.product_id AND d.batch_id=NEW.batch_id
      AND o.status='pending' AND o.source_type IN ('self_made','production_extra')
      AND d.inbound_number=NEW.quantity AND d.unit_snapshot=NEW.unit_snapshot
      AND b.source_type=o.source_type AND b.source_work_order_id=o.work_order_id
      AND b.source_production_batch_id=o.production_batch_id AND b.product_id=o.product_id
      AND b.batch_code=d.requested_batch_code AND b.batch_status='available'
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished-goods ledger entry must match the pending receipt detail and source batch';
  END IF;
END;

CREATE TRIGGER trg_finished_inbound_order_update
BEFORE UPDATE ON inbound_order
FOR EACH ROW
BEGIN
  DECLARE expected_quantity BIGINT UNSIGNED;
  DECLARE matching_details BIGINT;
  IF OLD.product_id IS NOT NULL OR NEW.product_id IS NOT NULL THEN
    IF OLD.status<>'pending' OR NOT (NEW.product_id <=> OLD.product_id)
      OR NOT (NEW.source_type <=> OLD.source_type)
      OR NOT (NEW.production_batch_id <=> OLD.production_batch_id)
      OR NOT (NEW.work_order_id <=> OLD.work_order_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished-goods order source and finalized receipts are immutable';
    END IF;
    IF NEW.status='completed' THEN
      IF NEW.inbound_at IS NULL OR NEW.operator_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished-goods receipt requires confirmation time and operator';
      END IF;
      SELECT CASE WHEN NEW.source_type='self_made' THEN available_quantity ELSE extra_quantity END
        INTO expected_quantity FROM production_output_revision WHERE id=NEW.output_revision_id;
      SELECT COUNT(*) INTO matching_details
      FROM inbound_detail d JOIN item_batch b ON b.id=d.batch_id
      JOIN inventory_transaction t ON t.reference_detail_id=d.id AND t.reference_type='inbound_detail'
        AND t.product_id=d.product_id AND t.batch_id=d.batch_id AND t.transaction_type='production_inbound'
      WHERE d.inbound_id=NEW.id AND d.product_id=NEW.product_id AND d.inbound_number=expected_quantity
        AND expected_quantity>0 AND t.quantity=d.inbound_number AND t.stock_status='available'
        AND b.source_type=NEW.source_type AND b.source_work_order_id=NEW.work_order_id
        AND b.source_production_batch_id=NEW.production_batch_id AND b.product_id=NEW.product_id
        AND b.batch_code=d.requested_batch_code;
      IF matching_details<>1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Confirm all approved finished output once with exactly one matching detail, batch and ledger entry';
      END IF;
    ELSEIF NEW.status='cancelled' AND EXISTS (SELECT 1 FROM inbound_detail WHERE inbound_id=NEW.id AND batch_id IS NOT NULL) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot cancel a finished-goods order after its inventory batch has been created';
    END IF;
  END IF;
END;

CREATE TRIGGER trg_procurement_receipt_batch_bind BEFORE UPDATE ON procurement_receipt_line
FOR EACH ROW
BEGIN
  IF NOT (NEW.receipt_id <=> OLD.receipt_id) OR NOT (NEW.purchase_order_id <=> OLD.purchase_order_id)
    OR NOT (NEW.purchase_order_line_id <=> OLD.purchase_order_line_id) OR NOT (NEW.item_id <=> OLD.item_id)
    OR NOT (NEW.material_variant_id <=> OLD.material_variant_id) OR NOT (NEW.supplier_batch_code <=> OLD.supplier_batch_code)
    OR (OLD.batch_id IS NOT NULL AND NOT (NEW.batch_id <=> OLD.batch_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt identity and its bound inventory batch cannot change';
  END IF;
END;

UPDATE permissions SET api_path='/api/production/finished-goods-inbounds/:inboundId/actions/confirm' WHERE code='production:inbounds:confirm-finished';
