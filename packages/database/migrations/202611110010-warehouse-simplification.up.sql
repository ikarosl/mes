-- Isolated warehouse-simplification experiment. Existing procurement business data is not converted.
-- All guards execute before destructive DDL; old production/deployed databases must never use this chain.
CREATE TEMPORARY TABLE tmp_warehouse_simplification_guard (invalid_count INT NOT NULL CHECK(invalid_count=0));
INSERT INTO tmp_warehouse_simplification_guard
SELECT (EXISTS(SELECT 1 FROM procurement_order) OR EXISTS(SELECT 1 FROM procurement_receipt)
  OR EXISTS(SELECT 1 FROM procurement_receipt_line) OR EXISTS(SELECT 1 FROM procurement_receipt_revision)
  OR EXISTS(SELECT 1 FROM procurement_receipt_round) OR EXISTS(SELECT 1 FROM procurement_receipt_acceptance)
  OR EXISTS(SELECT 1 FROM procurement_receipt_allocation) OR EXISTS(SELECT 1 FROM procurement_supplier_return)
  OR EXISTS(SELECT 1 FROM quality_inspection_case) OR EXISTS(SELECT 1 FROM quality_inspection_record)
  OR EXISTS(SELECT 1 FROM inbound_detail WHERE source_type='purchased'));
DROP TEMPORARY TABLE tmp_warehouse_simplification_guard;

DROP TRIGGER trg_inbound_detail_insert_guard;
DROP TRIGGER trg_inbound_detail_update_guard;
DROP TRIGGER trg_inventory_transaction_source_guard;
ALTER TABLE inbound_detail
  DROP FOREIGN KEY fk_inbound_detail_procurement_allocation,
  DROP FOREIGN KEY fk_inbound_detail_procurement_inspection,
  DROP FOREIGN KEY fk_inbound_detail_procurement_revision,
  DROP CHECK chk_inbound_detail_source,
  DROP COLUMN procurement_receipt_revision_id,
  DROP COLUMN procurement_inspection_id,
  DROP COLUMN procurement_allocation_id,
  ADD CONSTRAINT `chk_inbound_detail_source` CHECK ((((`source_type` = _utf8mb4'purchased') and (`item_id` is not null) and (`procurement_receipt_line_id` is not null) and (`supplier_name_snapshot` is not null) and (char_length(trim(replace(replace(replace(replace(replace(`supplier_name_snapshot`,char(9),_utf8mb4''),char(10),_utf8mb4''),char(11),_utf8mb4''),char(12),_utf8mb4''),char(13),_utf8mb4''))) > 0) and (`production_output_id` is null) and (`production_batch_id` is null) and (`demand_id` is null) and (`return_allocation_id` is null)) or ((`source_type` = _utf8mb4'finished_product') and (`product_id` is not null) and (`procurement_receipt_line_id` is null) and (`supplier_name_snapshot` is null) and (`production_output_id` is not null) and (`production_batch_id` is null) and (`demand_id` is null) and (`return_allocation_id` is null)) or ((`source_type` = _utf8mb4'return_inbound') and (`item_id` is not null) and (`procurement_receipt_line_id` is null) and (`supplier_name_snapshot` is null) and (`production_output_id` is null) and (`production_batch_id` is not null) and (`demand_id` is not null) and (`return_allocation_id` is not null) and (`target_mode` = _utf8mb4'existing')) or ((`source_type` = _utf8mb4'other') and (`procurement_receipt_line_id` is null) and (`supplier_name_snapshot` is null) and (`production_output_id` is null) and (`production_batch_id` is null) and (`demand_id` is null) and (`return_allocation_id` is null))));

ALTER TABLE quality_inspection_case
  DROP FOREIGN KEY fk_quality_case_incoming_round,
  DROP FOREIGN KEY fk_quality_case_superseding_round,
  DROP FOREIGN KEY fk_quality_inspection_case_revision;
ALTER TABLE procurement_receipt_line
  DROP FOREIGN KEY fk_procurement_receipt_current_revision,
  DROP FOREIGN KEY fk_receipt_line_current_round,
  DROP COLUMN current_receipt_revision_id,
  DROP COLUMN current_round_id,
  DROP COLUMN over_receipt_note,
  ADD UNIQUE KEY uk_procurement_receipt_line_receipt(id,receipt_id),
  ADD UNIQUE KEY uk_procurement_receipt_line_source(receipt_id,purchase_order_line_id);
DROP TABLE procurement_supplier_return;
DROP TABLE procurement_receipt_allocation;
DROP TABLE procurement_receipt_acceptance;
DROP TABLE procurement_receipt_round;
DROP TABLE procurement_receipt_revision;

CREATE TABLE procurement_receipt_handling (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_line_id BIGINT UNSIGNED NOT NULL,
  inbound_id BIGINT UNSIGNED NULL,
  other_handling_note TEXT NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  KEY idx_procurement_receipt_handling_history(receipt_line_id,created_at,id),
  KEY idx_procurement_receipt_handling_inbound(inbound_id),
  CONSTRAINT fk_procurement_receipt_handling_line FOREIGN KEY(receipt_line_id) REFERENCES procurement_receipt_line(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_procurement_receipt_handling_inbound FOREIGN KEY(inbound_id) REFERENCES inbound_order(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_procurement_receipt_handling_actor FOREIGN KEY(created_by) REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT chk_procurement_receipt_handling_note CHECK(CHAR_LENGTH(TRIM(other_handling_note)) BETWEEN 1 AND 2000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TRIGGER trg_procurement_receipt_handling_insert BEFORE INSERT ON procurement_receipt_handling FOR EACH ROW BEGIN
  DECLARE receipt_voided TINYINT;
  SELECT r.is_voided INTO receipt_voided FROM procurement_receipt r
    JOIN procurement_receipt_line line ON line.receipt_id=r.id WHERE line.id=NEW.receipt_line_id FOR SHARE;
  IF receipt_voided IS NULL OR receipt_voided<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Warehouse notes require an active arrival';
  END IF;
END;
CREATE TRIGGER trg_procurement_receipt_handling_no_update BEFORE UPDATE ON procurement_receipt_handling FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Warehouse handling notes are immutable';
CREATE TRIGGER trg_procurement_receipt_handling_no_delete BEFORE DELETE ON procurement_receipt_handling FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Warehouse handling notes are immutable';
CREATE TRIGGER trg_procurement_receipt_line_no_delete BEFORE DELETE ON procurement_receipt_line FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Arrival source facts are immutable';

CREATE TRIGGER `trg_inbound_detail_insert_guard` BEFORE INSERT ON `inbound_detail` FOR EACH ROW BEGIN

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
    SELECT 1 FROM procurement_receipt_line l
    JOIN procurement_receipt receipt ON receipt.id=l.receipt_id
    JOIN procurement_order_line original_line ON original_line.id=l.purchase_order_line_id
    WHERE l.id=NEW.procurement_receipt_line_id AND receipt.is_voided=0
      AND l.item_id=NEW.item_id AND l.material_variant_id=NEW.material_variant_id
      AND original_line.item_id=NEW.item_id AND original_line.material_variant_id=NEW.material_variant_id
      AND original_line.unit_snapshot=NEW.unit_snapshot AND original_line.item_code_snapshot=NEW.item_code_snapshot
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Purchase inbound requires its matching active arrival material'; END IF;
  IF NEW.source_type='finished_product' AND (NOT(NEW.product_id <=> parent_product) OR NOT EXISTS(
    SELECT 1 FROM production_tracking_output output JOIN work_orders wo ON wo.id=output.work_order_id
    WHERE output.id=NEW.production_output_id AND output.production_batch_id=parent_batch
      AND output.work_order_id=parent_work_order AND output.product_id=NEW.product_id
      AND output.quantity=NEW.inbound_number AND output.quantity>0
      AND wo.unit_snapshot=NEW.unit_snapshot AND wo.product_code_snapshot=NEW.item_code_snapshot
  )) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished inbound requires its exact final tracking output'; END IF;
  IF NEW.source_type='return_inbound' AND NOT EXISTS(
    SELECT 1 FROM production_item_allocation a JOIN production_item_demand d ON d.id=a.demand_id
    WHERE a.id=NEW.return_allocation_id AND a.demand_id=NEW.demand_id AND a.production_batch_id=parent_batch
      AND a.production_batch_id=NEW.production_batch_id AND a.item_id=NEW.item_id AND a.material_variant_id=NEW.material_variant_id
      AND a.batch_id=NEW.batch_id AND a.unit_snapshot=NEW.unit_snapshot AND d.item_code_snapshot=NEW.item_code_snapshot
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Material return requires the original allocation batch identity and unit'; END IF;


END;

CREATE TRIGGER `trg_inbound_detail_update_guard` BEFORE UPDATE ON `inbound_detail` FOR EACH ROW BEGIN

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
    IF NEW.is_deleted=1 THEN
      IF OLD.source_type<>'other' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Only other drafts permit deleting a detail';
      END IF;
    IF (NOT(NEW.id <=> OLD.id)
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
      OR NOT(NEW.supplier_name_snapshot <=> OLD.supplier_name_snapshot)
      OR NOT(NEW.production_output_id <=> OLD.production_output_id)
      OR NOT(NEW.production_batch_id <=> OLD.production_batch_id)
      OR NOT(NEW.demand_id <=> OLD.demand_id)
      OR NOT(NEW.return_allocation_id <=> OLD.return_allocation_id)
      OR NOT(NEW.remark <=> OLD.remark)
      OR NOT(NEW.created_by <=> OLD.created_by)
      OR NOT(NEW.created_at <=> OLD.created_at)) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Soft deletion preserves the complete inbound business row';
    END IF;
    ELSE
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
      AND NEW.supplier_name_snapshot <=> OLD.supplier_name_snapshot
      AND NEW.production_output_id <=> OLD.production_output_id
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
    SELECT 1 FROM procurement_receipt_line l
    JOIN procurement_receipt receipt ON receipt.id=l.receipt_id
    JOIN procurement_order_line original_line ON original_line.id=l.purchase_order_line_id
    WHERE l.id=NEW.procurement_receipt_line_id AND receipt.is_voided=0
      AND l.item_id=NEW.item_id AND l.material_variant_id=NEW.material_variant_id
      AND original_line.item_id=NEW.item_id AND original_line.material_variant_id=NEW.material_variant_id
      AND original_line.unit_snapshot=NEW.unit_snapshot AND original_line.item_code_snapshot=NEW.item_code_snapshot
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Purchase inbound requires its matching active arrival material'; END IF;
  IF NEW.source_type='finished_product' AND (NOT(NEW.product_id <=> parent_product) OR NOT EXISTS(
    SELECT 1 FROM production_tracking_output output JOIN work_orders wo ON wo.id=output.work_order_id
    WHERE output.id=NEW.production_output_id AND output.production_batch_id=parent_batch
      AND output.work_order_id=parent_work_order AND output.product_id=NEW.product_id
      AND output.quantity=NEW.inbound_number AND output.quantity>0
      AND wo.unit_snapshot=NEW.unit_snapshot AND wo.product_code_snapshot=NEW.item_code_snapshot
  )) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished inbound requires its exact final tracking output'; END IF;
  IF NEW.source_type='return_inbound' AND NOT EXISTS(
    SELECT 1 FROM production_item_allocation a JOIN production_item_demand d ON d.id=a.demand_id
    WHERE a.id=NEW.return_allocation_id AND a.demand_id=NEW.demand_id AND a.production_batch_id=parent_batch
      AND a.production_batch_id=NEW.production_batch_id AND a.item_id=NEW.item_id AND a.material_variant_id=NEW.material_variant_id
      AND a.batch_id=NEW.batch_id AND a.unit_snapshot=NEW.unit_snapshot AND d.item_code_snapshot=NEW.item_code_snapshot
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Material return requires the original allocation batch identity and unit'; END IF;

    END IF;
  END IF;

END;

CREATE TRIGGER `trg_inventory_transaction_source_guard` BEFORE INSERT ON `inventory_transaction` FOR EACH ROW BEGIN

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
    IF parent_source='finished_product' THEN
      SELECT d.production_output_id,a.quantity INTO source_allocation_id,authorized_quantity
      FROM inbound_detail d JOIN production_tracking_output a ON a.id=d.production_output_id WHERE d.id=NEW.reference_detail_id;
      SELECT COALESCE(SUM(t.quantity),0) INTO consumed_quantity FROM inbound_detail d
      JOIN inventory_transaction t ON t.reference_type='inbound_detail' AND t.reference_detail_id=d.id AND t.transaction_type='production_inbound' AND t.reversal_of_transaction_id IS NULL
      WHERE d.production_output_id=source_allocation_id AND d.is_deleted=0;
      IF consumed_quantity<>0 OR NEW.quantity<>authorized_quantity THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Final tracking output is posted once for its exact quantity'; END IF;
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
