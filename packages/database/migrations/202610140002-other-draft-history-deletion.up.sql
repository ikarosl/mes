-- Register OI / OO kinds before enabling other draft writers; preserve every sequence.
ALTER TABLE business_number_daily_sequence
  DROP CHECK chk_business_number_kind,
  ADD CONSTRAINT chk_business_number_kind CHECK(number_kind IN(
    'work_order',
    'production_batch',
    'purchase_order',
    'purchase_receipt',
    'supplier_return',
    'purchase_inbound',
    'finished_inbound',
    'other_inbound',
    'other_outbound',
    'inventory_batch',
    'stock_check',
    'production_material_outbound',
    'production_material_return',
    'material_loss',
    'manual_material_demand',
    'rework',
    'step_report',
    'abnormal_disposition',
    'scrap_supplement_plan',
    'material_supplement',
    'approval_instance'
  ));

-- Pause Inventory draft/confirmation writes while replacing the two UPDATE guards.
-- Soft deletion records history only. It must remain possible after the target
-- batch, Product object, category or exact version becomes unavailable.
-- The parent lock, pending/other/unposted qualification, immutable row contents
-- and deletion audit CHECK remain unchanged; no business data is rewritten.
DROP TRIGGER trg_inbound_detail_update_guard;
DROP TRIGGER trg_outbound_detail_update_guard;

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
