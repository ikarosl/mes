-- One-time 20261102 baseline: phase 3, inventory.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Trigger DATABASE_COLLATION is captured when created, so reject a different default.
CREATE TEMPORARY TABLE tmp_baseline_0312_collation_guard (
  invalid_collation TINYINT NOT NULL,
  CONSTRAINT chk_baseline_0312_collation CHECK (invalid_collation = 0)
) ENGINE=MEMORY;
INSERT INTO tmp_baseline_0312_collation_guard (invalid_collation)
SELECT 1 FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = DATABASE()
  AND (DEFAULT_CHARACTER_SET_NAME <> 'utf8mb4'
       OR DEFAULT_COLLATION_NAME <> 'utf8mb4_0900_ai_ci');
DROP TEMPORARY TABLE tmp_baseline_0312_collation_guard;

SET @baseline_saved_sql_mode = @@SESSION.sql_mode;
SET @baseline_saved_character_set_client = @@SESSION.character_set_client;
SET @baseline_saved_collation_connection = @@SESSION.collation_connection;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

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
    SELECT 1 FROM procurement_receipt_allocation a
    JOIN procurement_receipt_acceptance h ON h.id=a.acceptance_id AND h.receipt_line_id=a.receipt_line_id AND h.round_id=a.round_id
    JOIN procurement_receipt_round r ON r.id=a.round_id AND r.receipt_line_id=a.receipt_line_id
    JOIN procurement_receipt_line l ON l.id=a.receipt_line_id
    JOIN procurement_order_line original_line ON original_line.id=l.purchase_order_line_id
    JOIN quality_inspection_record q ON q.id=h.inspection_record_id
    WHERE a.id=NEW.procurement_allocation_id AND a.disposition='inbound' AND a.termination_reason IS NULL
      AND l.id=NEW.procurement_receipt_line_id AND l.item_id=NEW.item_id AND l.material_variant_id=NEW.material_variant_id
      AND l.current_round_id=a.round_id AND r.status='finalized' AND r.inspection_id=NEW.procurement_inspection_id
      AND l.current_receipt_revision_id=NEW.procurement_receipt_revision_id
      AND h.after_receipt_revision_id=NEW.procurement_receipt_revision_id AND h.inspection_record_id=NEW.procurement_inspection_id
      AND q.release_decision='released' AND original_line.item_id=NEW.item_id AND original_line.material_variant_id=NEW.material_variant_id
      AND original_line.unit_snapshot=NEW.unit_snapshot
      AND original_line.item_code_snapshot=NEW.item_code_snapshot
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

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

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
    JOIN procurement_order_line original_line ON original_line.id=l.purchase_order_line_id
    JOIN quality_inspection_record q ON q.id=h.inspection_record_id
    WHERE a.id=NEW.procurement_allocation_id AND a.disposition='inbound' AND a.termination_reason IS NULL
      AND l.id=NEW.procurement_receipt_line_id AND l.item_id=NEW.item_id AND l.material_variant_id=NEW.material_variant_id
      AND l.current_round_id=a.round_id AND r.status='finalized' AND r.inspection_id=NEW.procurement_inspection_id
      AND l.current_receipt_revision_id=NEW.procurement_receipt_revision_id
      AND h.after_receipt_revision_id=NEW.procurement_receipt_revision_id AND h.inspection_record_id=NEW.procurement_inspection_id
      AND q.release_decision='released' AND original_line.item_id=NEW.item_id AND original_line.material_variant_id=NEW.material_variant_id
      AND original_line.unit_snapshot=NEW.unit_snapshot
      AND original_line.item_code_snapshot=NEW.item_code_snapshot
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
  END IF;

END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_inbound_detail_delete_guard` BEFORE DELETE ON `inbound_detail` FOR EACH ROW BEGIN

  IF NOT(COALESCE(@company_inventory_test_cleanup,0)=1 AND (RIGHT(DATABASE(),5)='_test' OR RIGHT(DATABASE(),3)='_ci')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound details cannot be physically deleted'; END IF;

END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_inbound_order_insert_guard` BEFORE INSERT ON `inbound_order` FOR EACH ROW BEGIN

  IF NEW.status<>'pending' OR NEW.version<>0 OR NEW.created_by IS NULL OR NEW.updated_by IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory order must start pending with version zero and complete creation audit';
  END IF;

END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_inbound_order_update_guard` BEFORE UPDATE ON `inbound_order` FOR EACH ROW BEGIN

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

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_inbound_order_delete_guard` BEFORE DELETE ON `inbound_order` FOR EACH ROW BEGIN

  IF NOT(COALESCE(@company_inventory_test_cleanup,0)=1 AND (RIGHT(DATABASE(),5)='_test' OR RIGHT(DATABASE(),3)='_ci')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory orders cannot be physically deleted'; END IF;

END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_inventory_batch_balance_reject_negative_insert` BEFORE INSERT ON `inventory_batch_balance` FOR EACH ROW BEGIN
  IF NEW.current_quantity<0
    AND COALESCE(@company_inventory_test_cleanup,0)<>1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='inventory batch balance cannot be negative';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_inventory_batch_balance_reject_negative_update` BEFORE UPDATE ON `inventory_batch_balance` FOR EACH ROW BEGIN
  IF NEW.current_quantity<0
    AND COALESCE(@company_inventory_test_cleanup,0)<>1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='inventory batch balance cannot be negative';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_inventory_variant_balance_reject_negative_insert` BEFORE INSERT ON `inventory_material_variant_balance` FOR EACH ROW BEGIN
  IF NEW.current_quantity < 0
    AND COALESCE(@company_inventory_test_cleanup, 0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'inventory variant balance cannot be negative';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_inventory_variant_balance_reject_negative_update` BEFORE UPDATE ON `inventory_material_variant_balance` FOR EACH ROW BEGIN
  IF NEW.current_quantity < 0
    AND COALESCE(@company_inventory_test_cleanup, 0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'inventory variant balance cannot be negative';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

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

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_inventory_transaction_reject_update` BEFORE UPDATE ON `inventory_transaction` FOR EACH ROW BEGIN
  IF COALESCE(@company_inventory_test_cleanup, 0) <> 1
    OR (DATABASE() NOT LIKE '%\\_test' AND DATABASE() NOT LIKE '%\\_ci') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'inventory_transaction is immutable; append a reversal transaction instead';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_inventory_transaction_reject_delete` BEFORE DELETE ON `inventory_transaction` FOR EACH ROW BEGIN
  IF COALESCE(@company_inventory_test_cleanup, 0) <> 1
    OR (DATABASE() NOT LIKE '%\\_test' AND DATABASE() NOT LIKE '%\\_ci') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'inventory_transaction is immutable; append a reversal transaction instead';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_inventory_transaction_update_balances` AFTER INSERT ON `inventory_transaction` FOR EACH ROW BEGIN
  INSERT INTO inventory_batch_balance (batch_id,item_id,product_id,stock_status,current_quantity)
  VALUES (NEW.batch_id,NEW.item_id,NEW.product_id,NEW.stock_status,0)
  ON DUPLICATE KEY UPDATE batch_id=VALUES(batch_id);

  UPDATE inventory_batch_balance
  SET current_quantity=current_quantity+CAST(NEW.quantity AS SIGNED),version=version+1
  WHERE batch_id=NEW.batch_id AND stock_status=NEW.stock_status;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_inventory_transaction_update_variant_balance` AFTER INSERT ON `inventory_transaction` FOR EACH ROW FOLLOWS `trg_inventory_transaction_update_balances` BEGIN
  DECLARE current_batch_status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  IF NEW.product_id IS NULL THEN
  SELECT batch_status INTO current_batch_status
  FROM item_batch
  WHERE id = NEW.batch_id;

  INSERT INTO inventory_material_variant_balance (
    material_variant_id,
    material_id,
    stock_status,
    batch_status,
    current_quantity
  ) VALUES (
    NEW.material_variant_id,
    NEW.item_id,
    NEW.stock_status,
    current_batch_status,
    0
  )
  ON DUPLICATE KEY UPDATE
    material_variant_id = VALUES(material_variant_id);

  UPDATE inventory_material_variant_balance
  SET current_quantity = current_quantity + CAST(NEW.quantity AS SIGNED),
      version = version + 1
  WHERE material_variant_id = NEW.material_variant_id
    AND stock_status = NEW.stock_status
    AND batch_status = current_batch_status;
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_inventory_transaction_cleanup_balances` AFTER DELETE ON `inventory_transaction` FOR EACH ROW BEGIN
  UPDATE inventory_batch_balance
  SET current_quantity=current_quantity-CAST(OLD.quantity AS SIGNED),version=version+1
  WHERE batch_id=OLD.batch_id AND stock_status=OLD.stock_status;

  DELETE FROM inventory_batch_balance
  WHERE batch_id=OLD.batch_id AND stock_status=OLD.stock_status AND current_quantity=0;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_inventory_transaction_cleanup_variant_balance` AFTER DELETE ON `inventory_transaction` FOR EACH ROW FOLLOWS `trg_inventory_transaction_cleanup_balances` BEGIN
  DECLARE current_batch_status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  IF OLD.product_id IS NULL THEN
  SELECT batch_status INTO current_batch_status
  FROM item_batch
  WHERE id = OLD.batch_id;

  UPDATE inventory_material_variant_balance
  SET current_quantity = current_quantity - CAST(OLD.quantity AS SIGNED),
      version = version + 1
  WHERE material_variant_id = OLD.material_variant_id
    AND stock_status = OLD.stock_status
    AND batch_status = current_batch_status;

  DELETE FROM inventory_material_variant_balance
  WHERE material_variant_id = OLD.material_variant_id
    AND stock_status = OLD.stock_status
    AND batch_status = current_batch_status
    AND current_quantity = 0;
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_item_batch_creation_guard` BEFORE INSERT ON `item_batch` FOR EACH ROW BEGIN

  IF NEW.created_by IS NULL OR NEW.updated_by IS NULL OR NEW.version<>0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A new inventory batch requires creation audit and version zero';
  END IF;
  IF NEW.source_type='other' AND (NEW.provider IS NOT NULL OR NEW.source_work_order_id IS NOT NULL
    OR NEW.source_production_batch_id IS NOT NULL OR NEW.production_date IS NOT NULL OR NEW.remark IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='An other new batch does not carry a business source date or description';
  END IF;

END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_item_batch_reject_material_identity_update` BEFORE UPDATE ON `item_batch` FOR EACH ROW BEGIN
  IF NOT(NEW.item_id <=> OLD.item_id) OR NOT(NEW.material_variant_id <=> OLD.material_variant_id)
    OR NOT(NEW.product_id <=> OLD.product_id) OR NOT(NEW.material_variant_code_snapshot <=> OLD.material_variant_code_snapshot)
    OR NOT(NEW.source_type <=> OLD.source_type) OR NOT(NEW.batch_code <=> OLD.batch_code)
    OR NOT(NEW.item_code_snapshot <=> OLD.item_code_snapshot) OR NOT(NEW.unit_snapshot <=> OLD.unit_snapshot)
    OR NOT(NEW.provider <=> OLD.provider) OR NOT(NEW.source_work_order_id <=> OLD.source_work_order_id)
    OR NOT(NEW.source_production_batch_id <=> OLD.source_production_batch_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory batch identity is immutable';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_item_batch_move_variant_balance` AFTER UPDATE ON `item_batch` FOR EACH ROW BEGIN
  IF NEW.product_id IS NULL AND OLD.batch_status <> NEW.batch_status THEN
    INSERT INTO inventory_material_variant_balance (
      material_variant_id,
      material_id,
      stock_status,
      batch_status,
      current_quantity
    )
    SELECT
      NEW.material_variant_id,
      NEW.item_id,
      stock_status,
      NEW.batch_status,
      current_quantity
    FROM inventory_batch_balance
    WHERE batch_id = NEW.id
    ON DUPLICATE KEY UPDATE
      current_quantity = inventory_material_variant_balance.current_quantity
        + VALUES(current_quantity),
      version = inventory_material_variant_balance.version + 1;

    UPDATE inventory_material_variant_balance variant_balance
    JOIN inventory_batch_balance batch_balance
      ON batch_balance.stock_status = variant_balance.stock_status
      AND batch_balance.batch_id = OLD.id
    SET variant_balance.current_quantity = variant_balance.current_quantity
          - batch_balance.current_quantity,
        variant_balance.version = variant_balance.version + 1
    WHERE variant_balance.material_variant_id = OLD.material_variant_id
      AND variant_balance.batch_status = OLD.batch_status;

    DELETE FROM inventory_material_variant_balance
    WHERE material_variant_id = OLD.material_variant_id
      AND batch_status = OLD.batch_status
      AND current_quantity = 0;
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_outbound_detail_insert_guard` BEFORE INSERT ON `outbound_detail` FOR EACH ROW BEGIN

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

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_outbound_detail_update_guard` BEFORE UPDATE ON `outbound_detail` FOR EACH ROW BEGIN

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
    IF NEW.is_deleted=1 THEN
    IF (NOT(NEW.id <=> OLD.id)
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
    ELSE


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
  END IF;

END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_outbound_detail_delete_guard` BEFORE DELETE ON `outbound_detail` FOR EACH ROW BEGIN

  IF NOT(COALESCE(@company_inventory_test_cleanup,0)=1 AND (RIGHT(DATABASE(),5)='_test' OR RIGHT(DATABASE(),3)='_ci')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Outbound details cannot be physically deleted'; END IF;

END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_outbound_order_insert_guard` BEFORE INSERT ON `outbound_order` FOR EACH ROW BEGIN

  IF NEW.status<>'pending_picking' OR NEW.version<>0 OR NEW.created_by IS NULL OR NEW.updated_by IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory order must start pending with version zero and complete creation audit';
  END IF;

END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_outbound_order_update_guard` BEFORE UPDATE ON `outbound_order` FOR EACH ROW BEGIN

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

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_outbound_order_delete_guard` BEFORE DELETE ON `outbound_order` FOR EACH ROW BEGIN

  IF NOT(COALESCE(@company_inventory_test_cleanup,0)=1 AND (RIGHT(DATABASE(),5)='_test' OR RIGHT(DATABASE(),3)='_ci')) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory orders cannot be physically deleted'; END IF;

END;

SET SESSION sql_mode = @baseline_saved_sql_mode;
SET SESSION character_set_client = @baseline_saved_character_set_client;
SET SESSION collation_connection = @baseline_saved_collation_connection;
SET @baseline_saved_sql_mode = NULL;
SET @baseline_saved_character_set_client = NULL;
SET @baseline_saved_collation_connection = NULL;
