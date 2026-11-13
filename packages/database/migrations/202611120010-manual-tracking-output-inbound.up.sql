-- Preserve the supported current database and every existing receipt. Stop production,
-- finished-inbound and inventory writes; take a verified matching-application backup first.
-- No business row is inferred, rewritten, deleted, reseeded or relinked by this migration.
CREATE TEMPORARY TABLE tmp_manual_output_preflight (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_manual_output_historical_facts CHECK(invalid_data=0)
) ENGINE=MEMORY;
-- An existing source detail must already represent exactly one completed whole-output receipt.
INSERT INTO tmp_manual_output_preflight
SELECT 1 WHERE EXISTS(
 SELECT 1 FROM inbound_detail d
 LEFT JOIN inbound_order io ON io.id=d.inbound_id
 LEFT JOIN production_tracking_output output ON output.id=d.production_output_id
 LEFT JOIN work_orders wo ON wo.id=output.work_order_id
 LEFT JOIN item_batch b ON b.id=d.batch_id
 WHERE d.source_type='finished_product' AND (
  d.is_deleted<>0 OR io.id IS NULL OR io.source_type<>'finished_product' OR io.status<>'completed'
  OR output.id IS NULL OR output.quantity<=0 OR d.inbound_number<>output.quantity
  OR NOT(io.production_batch_id<=>output.production_batch_id) OR NOT(io.work_order_id<=>output.work_order_id)
  OR NOT(io.product_id<=>output.product_id) OR NOT(d.product_id<=>output.product_id)
  OR NOT(d.unit_snapshot<=>wo.unit_snapshot) OR NOT(d.item_code_snapshot<=>wo.product_code_snapshot)
  OR b.id IS NULL OR NOT(b.product_id<=>d.product_id) OR b.unit_snapshot<>d.unit_snapshot
  OR d.stock_status<>'available'
  OR (SELECT COUNT(*) FROM inventory_transaction tx
      WHERE tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id
       AND tx.reversal_of_transaction_id IS NULL)=0
  OR (SELECT COUNT(*) FROM inventory_transaction tx
      WHERE tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id
       AND tx.reversal_of_transaction_id IS NULL)<>1
  OR NOT EXISTS(SELECT 1 FROM inventory_transaction tx
      WHERE tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id
       AND tx.transaction_type='production_inbound' AND tx.reversal_of_transaction_id IS NULL
       AND tx.quantity=d.inbound_number AND tx.product_id=d.product_id
       AND tx.item_id IS NULL AND tx.material_variant_id IS NULL AND tx.batch_id=d.batch_id
       AND tx.unit_snapshot=d.unit_snapshot AND tx.stock_status=d.stock_status)
 ));
INSERT INTO tmp_manual_output_preflight
SELECT 1 WHERE EXISTS(
 SELECT 1 FROM inventory_transaction tx
 LEFT JOIN inbound_detail d ON tx.reference_type='inbound_detail' AND d.id=tx.reference_detail_id
 WHERE tx.transaction_type='production_inbound' AND (
  tx.reversal_of_transaction_id IS NOT NULL OR d.id IS NULL OR d.source_type<>'finished_product'
  OR tx.quantity<=0 OR tx.quantity<>d.inbound_number OR NOT(tx.product_id<=>d.product_id)
  OR tx.batch_id<>d.batch_id OR tx.unit_snapshot<>d.unit_snapshot OR tx.stock_status<>d.stock_status
 ));
-- Before this migration every positive terminal confirmation was automatically received.
-- Require that historical invariant instead of guessing whether a missing receipt is pending.
INSERT INTO tmp_manual_output_preflight
SELECT 1 WHERE EXISTS(
 SELECT 1 FROM production_tracking_output output WHERE output.quantity>0 AND NOT EXISTS(
  SELECT 1 FROM inbound_detail d JOIN inbound_order io ON io.id=d.inbound_id
  WHERE d.production_output_id=output.id AND d.source_type='finished_product' AND d.is_deleted=0
   AND io.source_type='finished_product' AND io.status='completed'
  )
);
-- Existing physical cards and immutable output identities must agree; do not guess a correction.
INSERT INTO tmp_manual_output_preflight
SELECT 1 WHERE EXISTS(
 SELECT 1 FROM production_tracking_output output
 JOIN production_batches task ON task.id=output.production_batch_id
 JOIN work_orders wo ON wo.id=task.work_order_id
 LEFT JOIN production_tracking_card card ON card.id=output.tracking_card_id
 WHERE output.work_order_id<>task.work_order_id OR output.product_id<>task.product_id
  OR (wo.order_type='research' AND output.tracking_card_id IS NOT NULL)
  OR (wo.order_type='mass_production' AND (card.id IS NULL OR card.status<>'completed'
    OR card.production_batch_id<>output.production_batch_id OR output.quantity<=0 OR output.quantity<>card.quantity))
);
-- There is no deterministic single-task ownership for an already mixed finished batch.
INSERT INTO tmp_manual_output_preflight
SELECT 1 WHERE EXISTS(
 SELECT d.batch_id FROM inbound_detail d JOIN inbound_order io ON io.id=d.inbound_id
 WHERE io.source_type='finished_product' AND io.status='completed' AND d.is_deleted=0
 GROUP BY d.batch_id HAVING COUNT(DISTINCT io.production_batch_id)>1
);
DROP TEMPORARY TABLE tmp_manual_output_preflight;

-- Historical completion modes cannot be inferred. They intentionally remain SQL NULL.
ALTER TABLE production_batches
 ADD COLUMN finish_mode VARCHAR(20) NULL DEFAULT NULL,
 ADD CONSTRAINT chk_tracking_task_finish_mode CHECK(
  finish_mode IS NULL OR (status='completed' AND finish_mode IN ('normal','early'))
 );

CREATE TABLE production_tracking_output_cancellation (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 production_output_id BIGINT UNSIGNED NOT NULL,
 reason TEXT NOT NULL,
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id),
 UNIQUE KEY uk_tracking_output_cancellation_output(production_output_id),
 KEY idx_tracking_output_cancellation_actor(created_by),
 CONSTRAINT fk_tracking_output_cancellation_output FOREIGN KEY(production_output_id)
  REFERENCES production_tracking_output(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT fk_tracking_output_cancellation_actor FOREIGN KEY(created_by)
  REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT chk_tracking_output_cancellation_reason CHECK(
  CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(reason,CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),''))) BETWEEN 1 AND 5000
 )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE production_tracking_output
 DROP INDEX uk_tracking_output_card,
 DROP INDEX uk_tracking_output_research,
 DROP COLUMN research_batch_id;

CREATE TRIGGER trg_tracking_output_insert_guard BEFORE INSERT ON production_tracking_output FOR EACH ROW BEGIN
 DECLARE task_status VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
 DECLARE order_status VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
 DECLARE order_kind VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
 DECLARE card_status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
 DECLARE card_quantity INT;
 DECLARE current_step BIGINT UNSIGNED;
 DECLARE last_step BIGINT UNSIGNED;
 DECLARE existing_output BIGINT UNSIGNED DEFAULT NULL;
 SELECT status,order_type INTO order_status,order_kind FROM work_orders WHERE id=NEW.work_order_id FOR UPDATE;
 SELECT status INTO task_status FROM production_batches
  WHERE id=NEW.production_batch_id AND work_order_id=NEW.work_order_id AND product_id=NEW.product_id FOR UPDATE;
 IF task_status IS NULL OR task_status<>'doing' OR order_status NOT IN ('released','doing') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking output requires its currently executing task and open work order';
 END IF;
 IF NEW.tracking_card_id IS NULL THEN
  IF order_kind<>'research' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Only research tasks confirm output without a tracking card'; END IF;
 ELSE
  SELECT status,quantity,current_step_record_id INTO card_status,card_quantity,current_step
   FROM production_tracking_card WHERE id=NEW.tracking_card_id AND production_batch_id=NEW.production_batch_id FOR UPDATE;
  SELECT id INTO last_step FROM batch_step_records WHERE production_batch_id=NEW.production_batch_id ORDER BY step_order_snapshot DESC,id DESC LIMIT 1;
  IF order_kind<>'mass_production' OR card_status IS NULL OR card_status<>'in_progress'
   OR NEW.quantity<=0 OR NEW.quantity<>card_quantity OR last_step IS NULL OR NOT(current_step<=>last_step)
   OR EXISTS(SELECT 1 FROM production_tracking_abnormality WHERE tracking_card_id=NEW.tracking_card_id AND status='open') THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking output requires the complete remaining terminal card quantity without open abnormalities';
  END IF;
  -- The card/task locks are the serial slot. Read current output/cancellation rows
  -- even when the caller established an older repeatable-read snapshot before waiting.
  SELECT output.id INTO existing_output FROM production_tracking_output output
   LEFT JOIN production_tracking_output_cancellation cancellation ON cancellation.production_output_id=output.id
   WHERE output.tracking_card_id=NEW.tracking_card_id AND cancellation.id IS NULL
   ORDER BY output.id LIMIT 1 FOR SHARE;
  IF existing_output IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A tracking card has at most one uncancelled output'; END IF;
 END IF;
END;

CREATE TRIGGER trg_tracking_output_cancellation_insert BEFORE INSERT ON production_tracking_output_cancellation FOR EACH ROW BEGIN
 DECLARE parent_task BIGINT UNSIGNED;
 DECLARE parent_order BIGINT UNSIGNED;
 DECLARE parent_card BIGINT UNSIGNED;
 DECLARE locked_output BIGINT UNSIGNED;
 DECLARE task_status VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
 DECLARE order_status VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
 DECLARE card_status VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
 DECLARE consumed_detail BIGINT UNSIGNED DEFAULT NULL;
 SELECT production_batch_id,work_order_id,tracking_card_id INTO parent_task,parent_order,parent_card
  FROM production_tracking_output WHERE id=NEW.production_output_id;
 SELECT status INTO order_status FROM work_orders WHERE id=parent_order FOR UPDATE;
 SELECT status INTO task_status FROM production_batches WHERE id=parent_task FOR UPDATE;
 IF task_status IS NULL OR task_status<>'doing' OR order_status NOT IN ('released','doing') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Revoke output only while its task and work order permit execution';
 END IF;
 IF parent_card IS NOT NULL THEN
  SELECT status INTO card_status FROM production_tracking_card WHERE id=parent_card FOR UPDATE;
  IF card_status IS NULL OR card_status<>'completed' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Only a completed output card can be restored by cancellation'; END IF;
 END IF;
 SELECT id INTO locked_output FROM production_tracking_output WHERE id=NEW.production_output_id FOR UPDATE;
 SELECT id INTO consumed_detail FROM inbound_detail WHERE production_output_id=NEW.production_output_id LIMIT 1 FOR UPDATE;
 IF locked_output IS NULL OR consumed_detail IS NOT NULL THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='An output referenced by any inbound detail cannot be cancelled';
 END IF;
END;
CREATE TRIGGER trg_tracking_output_cancellation_no_update BEFORE UPDATE ON production_tracking_output_cancellation FOR EACH ROW
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking output cancellations are immutable';
CREATE TRIGGER trg_tracking_output_cancellation_no_delete BEFORE DELETE ON production_tracking_output_cancellation FOR EACH ROW
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking output cancellations are immutable';

DROP TRIGGER trg_tracking_card_output_guard;
CREATE TRIGGER trg_tracking_card_output_guard BEFORE UPDATE ON production_tracking_card FOR EACH ROW BEGIN
 DECLARE active_output BIGINT UNSIGNED DEFAULT NULL;
 IF OLD.status='scrapped' OR NEW.card_no<>OLD.card_no OR NEW.production_batch_id<>OLD.production_batch_id OR NEW.personnel_id<>OLD.personnel_id
  OR NEW.personnel_code_snapshot<>OLD.personnel_code_snapshot OR NEW.personnel_name_snapshot<>OLD.personnel_name_snapshot
  OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by OR NEW.version<>OLD.version+1 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tracking card identity terminal scrap and version are protected';
 END IF;
 IF OLD.status='completed' THEN
  SELECT output.id INTO active_output FROM production_tracking_output output
   LEFT JOIN production_tracking_output_cancellation cancellation ON cancellation.production_output_id=output.id
   WHERE output.tracking_card_id=OLD.id AND cancellation.id IS NULL ORDER BY output.id LIMIT 1 FOR SHARE;
  IF NEW.status<>'in_progress' OR NEW.quantity<>OLD.quantity OR NOT(NEW.current_step_record_id<=>OLD.current_step_record_id)
   OR NOT(NEW.remark<=>OLD.remark) OR active_output IS NOT NULL
   OR NOT EXISTS(SELECT 1 FROM production_tracking_output output JOIN production_tracking_output_cancellation cancellation
      ON cancellation.production_output_id=output.id WHERE output.tracking_card_id=OLD.id) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Completed cards restore only after their unreceived output is cancelled';
  END IF;
 END IF;
END;

CREATE TRIGGER trg_tracking_task_lifecycle_guard BEFORE UPDATE ON production_batches FOR EACH ROW BEGIN
 DECLARE order_status VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
 IF OLD.started_at IS NOT NULL AND (NOT(NEW.started_at<=>OLD.started_at) OR NOT(NEW.started_by<=>OLD.started_by)
  OR NOT(NEW.start_reason<=>OLD.start_reason) OR NOT(NEW.start_material_snapshot<=>OLD.start_material_snapshot)) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='The first production task start facts cannot be replaced';
 END IF;
 IF NEW.status<>OLD.status AND NEW.version<>OLD.version+1 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Production task transitions advance their version exactly once';
 END IF;
 IF OLD.status='completed' AND NEW.status<>'completed' THEN
  SELECT status INTO order_status FROM work_orders WHERE id=OLD.work_order_id FOR SHARE;
  IF order_status IS NULL OR order_status NOT IN ('released','doing')
   OR (OLD.started_at IS NOT NULL AND NEW.status<>'doing')
   OR (OLD.started_at IS NULL AND (NEW.status NOT IN ('pending','material_pending') OR NEW.started_at IS NOT NULL))
   OR NEW.completed_at IS NOT NULL OR NEW.completed_by IS NOT NULL OR NEW.finish_reason IS NOT NULL OR NEW.finish_mode IS NOT NULL THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Task reopening requires an open work order and preserves the true first start';
  END IF;
 END IF;
 IF NEW.status='completed' AND OLD.status<>'completed' AND NEW.finish_mode IS NULL THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='New task completions explicitly record normal or early finish mode';
 END IF;
END;

DROP TRIGGER trg_inbound_detail_insert_guard;
DROP TRIGGER trg_inbound_detail_update_guard;
DROP TRIGGER trg_inventory_transaction_source_guard;
CREATE TRIGGER `trg_inbound_detail_insert_guard` BEFORE INSERT ON `inbound_detail` FOR EACH ROW BEGIN

  DECLARE parent_batch BIGINT UNSIGNED;
  DECLARE parent_work_order BIGINT UNSIGNED;
  DECLARE parent_product BIGINT UNSIGNED;
  DECLARE parent_source VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  DECLARE parent_status VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;


  DECLARE locked_output BIGINT UNSIGNED DEFAULT NULL;
  DECLARE output_cancellation BIGINT UNSIGNED DEFAULT NULL;
  DECLARE locked_target BIGINT UNSIGNED DEFAULT NULL;
  DECLARE target_sources BIGINT DEFAULT 0;
  DECLARE target_min_task BIGINT UNSIGNED DEFAULT 0;
  DECLARE target_max_task BIGINT UNSIGNED DEFAULT 0;

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
  IF NEW.source_type='finished_product' THEN
    SELECT id INTO locked_output FROM production_tracking_output WHERE id=NEW.production_output_id FOR UPDATE;
    SELECT id INTO output_cancellation FROM production_tracking_output_cancellation WHERE production_output_id=NEW.production_output_id FOR SHARE;
    IF locked_output IS NULL OR output_cancellation IS NOT NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished inbound requires an uncancelled whole output';
    END IF;
    IF NEW.batch_id IS NOT NULL THEN
      SELECT id INTO locked_target FROM item_batch WHERE id=NEW.batch_id FOR UPDATE;
      IF NEW.target_mode='new' AND EXISTS(SELECT 1 FROM inventory_transaction WHERE batch_id=NEW.batch_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A new finished batch must not already contain inventory facts';
      END IF;
      IF NEW.target_mode='existing' THEN
        SELECT COUNT(*),COALESCE(MIN(io.production_batch_id),0),COALESCE(MAX(io.production_batch_id),0)
          INTO target_sources,target_min_task,target_max_task
        FROM inbound_detail d JOIN inbound_order io ON io.id=d.inbound_id
        JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id
          AND tx.transaction_type='production_inbound' AND tx.reversal_of_transaction_id IS NULL
          AND tx.quantity=d.inbound_number AND tx.product_id=d.product_id AND tx.batch_id=d.batch_id
          AND tx.unit_snapshot=d.unit_snapshot AND tx.stock_status=d.stock_status
        WHERE d.batch_id=NEW.batch_id AND d.is_deleted=0 AND io.source_type='finished_product' AND io.status='completed' FOR SHARE;
        IF target_sources=0 OR target_min_task<>parent_batch OR target_max_task<>parent_batch THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Existing finished batch belongs to this exact production task';
        END IF;
      END IF;
    END IF;
  END IF;
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


  DECLARE locked_output BIGINT UNSIGNED DEFAULT NULL;
  DECLARE output_cancellation BIGINT UNSIGNED DEFAULT NULL;
  DECLARE locked_target BIGINT UNSIGNED DEFAULT NULL;
  DECLARE target_sources BIGINT DEFAULT 0;
  DECLARE target_min_task BIGINT UNSIGNED DEFAULT 0;
  DECLARE target_max_task BIGINT UNSIGNED DEFAULT 0;

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
  IF NEW.source_type='finished_product' THEN
    SELECT id INTO locked_output FROM production_tracking_output WHERE id=NEW.production_output_id FOR UPDATE;
    SELECT id INTO output_cancellation FROM production_tracking_output_cancellation WHERE production_output_id=NEW.production_output_id FOR SHARE;
    IF locked_output IS NULL OR output_cancellation IS NOT NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Finished inbound requires an uncancelled whole output';
    END IF;
    IF NEW.batch_id IS NOT NULL THEN
      SELECT id INTO locked_target FROM item_batch WHERE id=NEW.batch_id FOR UPDATE;
      IF NEW.target_mode='new' AND EXISTS(SELECT 1 FROM inventory_transaction WHERE batch_id=NEW.batch_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A new finished batch must not already contain inventory facts';
      END IF;
      IF NEW.target_mode='existing' THEN
        SELECT COUNT(*),COALESCE(MIN(io.production_batch_id),0),COALESCE(MAX(io.production_batch_id),0)
          INTO target_sources,target_min_task,target_max_task
        FROM inbound_detail d JOIN inbound_order io ON io.id=d.inbound_id
        JOIN inventory_transaction tx ON tx.reference_type='inbound_detail' AND tx.reference_detail_id=d.id
          AND tx.transaction_type='production_inbound' AND tx.reversal_of_transaction_id IS NULL
          AND tx.quantity=d.inbound_number AND tx.product_id=d.product_id AND tx.batch_id=d.batch_id
          AND tx.unit_snapshot=d.unit_snapshot AND tx.stock_status=d.stock_status
        WHERE d.batch_id=NEW.batch_id AND d.is_deleted=0 AND io.source_type='finished_product' AND io.status='completed' FOR SHARE;
        IF target_sources=0 OR target_min_task<>parent_batch OR target_max_task<>parent_batch THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Existing finished batch belongs to this exact production task';
        END IF;
      END IF;
    END IF;
  END IF;
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

  DECLARE output_cancellation BIGINT UNSIGNED DEFAULT NULL;
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
      FROM inbound_detail d JOIN production_tracking_output a ON a.id=d.production_output_id WHERE d.id=NEW.reference_detail_id FOR UPDATE;
      SELECT id INTO output_cancellation FROM production_tracking_output_cancellation WHERE production_output_id=source_allocation_id FOR SHARE;
      IF output_cancellation IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancelled tracking outputs never create inventory'; END IF;
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
