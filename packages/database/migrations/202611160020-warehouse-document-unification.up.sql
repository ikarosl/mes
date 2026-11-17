-- Authorized warehouse-document-unification experiment: initialize a separate empty inventory database.
-- Keep all affected application writes stopped. Old inventory is never guessed, rewritten or cleared.
CREATE TEMPORARY TABLE tmp_warehouse_document_unification_guard (
  invalid_data TINYINT NOT NULL,
  CONSTRAINT chk_warehouse_document_unification_empty CHECK (invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_warehouse_document_unification_guard(invalid_data)
SELECT 1 WHERE EXISTS(SELECT 1 FROM inbound_order)
  OR EXISTS(SELECT 1 FROM inbound_detail)
  OR EXISTS(SELECT 1 FROM outbound_order)
  OR EXISTS(SELECT 1 FROM outbound_detail)
  OR EXISTS(SELECT 1 FROM inventory_transaction);
DROP TEMPORARY TABLE tmp_warehouse_document_unification_guard;

ALTER TABLE inbound_order
  ADD COLUMN item_kind VARCHAR(30) NOT NULL AFTER source_type,
  ADD CONSTRAINT chk_inbound_order_item_kind CHECK (item_kind IN ('material','finished_product')),
  ADD CONSTRAINT chk_inbound_order_source_item_kind CHECK (
    (source_type IN ('purchased','return_inbound') AND item_kind='material')
    OR (source_type='finished_product' AND item_kind='finished_product')
    OR source_type='other'
  ),
  ADD KEY idx_inbound_order_kind_created(item_kind,created_at,id);
ALTER TABLE outbound_order
  ADD COLUMN item_kind VARCHAR(30) NOT NULL AFTER source_type,
  ADD CONSTRAINT chk_outbound_order_item_kind CHECK (item_kind IN ('material','finished_product')),
  ADD CONSTRAINT chk_outbound_order_source_item_kind CHECK (
    (source_type='production_material' AND item_kind='material') OR source_type='other'
  ),
  ADD KEY idx_outbound_order_kind_created(item_kind,created_at,id);
ALTER TABLE inventory_transaction
  ADD COLUMN reference_order_id BIGINT UNSIGNED NOT NULL AFTER reference_detail_id,
  ADD COLUMN reference_order_no_snapshot VARCHAR(100) NOT NULL AFTER reference_order_id,
  ADD CONSTRAINT chk_inventory_transaction_order_reference CHECK (
    reference_type IN ('inbound_detail','outbound_detail','stock_check_detail')
    AND reference_order_id>0
    AND CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(reference_order_no_snapshot,
      CHAR(9),''),CHAR(10),''),CHAR(11),''),CHAR(12),''),CHAR(13),'')))>0
  ),
  ADD KEY idx_inventory_transaction_order(reference_type,reference_order_id,id);

-- Newly introduced manual handling switch starts open; it does not reconstruct a historical decision.
ALTER TABLE procurement_receipt_line
  ADD COLUMN inbound_closed TINYINT NOT NULL DEFAULT 0 AFTER supplier_batch_code,
  ADD CONSTRAINT chk_procurement_receipt_line_inbound_closed CHECK(inbound_closed IN (0,1));

-- Both item kinds share one direction/day counter. Keep every historical counter kind and value.
ALTER TABLE business_number_daily_sequence
  DROP CHECK chk_business_number_kind,
  ADD CONSTRAINT chk_business_number_kind CHECK (number_kind IN (
    'production_tracking_card','work_order','production_batch','purchase_order','purchase_receipt',
    'incoming_inspection_order','incoming_inspection_report','supplier_return','purchase_inbound',
    'finished_inbound','other_inbound','other_outbound','inventory_batch','stock_check',
    'production_material_outbound','production_material_return','material_loss','manual_material_demand',
    'rework','step_report','abnormal_disposition','scrap_supplement_plan','material_supplement','approval_instance',
    'inbound_order','outbound_order'
  ));

CREATE TRIGGER trg_inbound_order_item_kind_guard BEFORE UPDATE ON inbound_order
FOR EACH ROW FOLLOWS trg_inbound_order_update_guard
BEGIN
  IF NOT(NEW.item_kind <=> OLD.item_kind) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory order item kind cannot change';
  END IF;
END;
CREATE TRIGGER trg_outbound_order_item_kind_guard BEFORE UPDATE ON outbound_order
FOR EACH ROW FOLLOWS trg_outbound_order_update_guard
BEGIN
  IF NOT(NEW.item_kind <=> OLD.item_kind) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory order item kind cannot change';
  END IF;
END;

CREATE TRIGGER trg_inbound_detail_item_kind_insert BEFORE INSERT ON inbound_detail
FOR EACH ROW FOLLOWS trg_inbound_detail_insert_guard
BEGIN
  DECLARE parent_kind VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  DECLARE source_closed TINYINT DEFAULT NULL;
  SELECT item_kind INTO parent_kind FROM inbound_order WHERE id=NEW.inbound_id FOR UPDATE;
  IF parent_kind IS NULL
    OR (parent_kind='material' AND (NEW.item_id IS NULL OR NEW.material_variant_id IS NULL OR NEW.product_id IS NOT NULL))
    OR (parent_kind='finished_product' AND (NEW.product_id IS NULL OR NEW.item_id IS NOT NULL OR NEW.material_variant_id IS NOT NULL)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound detail must match its order item kind';
  END IF;
  IF NEW.source_type='purchased' THEN
    SELECT inbound_closed INTO source_closed FROM procurement_receipt_line WHERE id=NEW.procurement_receipt_line_id FOR SHARE;
    IF source_closed IS NULL OR source_closed<>0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Closed arrival lines cannot create purchase inbounds';
    END IF;
  END IF;
END;
CREATE TRIGGER trg_inbound_detail_item_kind_update BEFORE UPDATE ON inbound_detail
FOR EACH ROW FOLLOWS trg_inbound_detail_update_guard
BEGIN
  DECLARE parent_kind VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  SELECT item_kind INTO parent_kind FROM inbound_order WHERE id=NEW.inbound_id FOR UPDATE;
  IF parent_kind IS NULL
    OR (parent_kind='material' AND (NEW.item_id IS NULL OR NEW.material_variant_id IS NULL OR NEW.product_id IS NOT NULL))
    OR (parent_kind='finished_product' AND (NEW.product_id IS NULL OR NEW.item_id IS NOT NULL OR NEW.material_variant_id IS NOT NULL)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound detail must match its order item kind';
  END IF;
END;
CREATE TRIGGER trg_outbound_detail_item_kind_insert BEFORE INSERT ON outbound_detail
FOR EACH ROW FOLLOWS trg_outbound_detail_insert_guard
BEGIN
  DECLARE parent_kind VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  SELECT item_kind INTO parent_kind FROM outbound_order WHERE id=NEW.outbound_id FOR UPDATE;
  IF parent_kind IS NULL
    OR (parent_kind='material' AND (NEW.item_id IS NULL OR NEW.material_variant_id IS NULL OR NEW.product_id IS NOT NULL))
    OR (parent_kind='finished_product' AND (NEW.product_id IS NULL OR NEW.item_id IS NOT NULL OR NEW.material_variant_id IS NOT NULL)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Outbound detail must match its order item kind';
  END IF;
END;
CREATE TRIGGER trg_outbound_detail_item_kind_update BEFORE UPDATE ON outbound_detail
FOR EACH ROW FOLLOWS trg_outbound_detail_update_guard
BEGIN
  DECLARE parent_kind VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
  SELECT item_kind INTO parent_kind FROM outbound_order WHERE id=NEW.outbound_id FOR UPDATE;
  IF parent_kind IS NULL
    OR (parent_kind='material' AND (NEW.item_id IS NULL OR NEW.material_variant_id IS NULL OR NEW.product_id IS NOT NULL))
    OR (parent_kind='finished_product' AND (NEW.product_id IS NULL OR NEW.item_id IS NOT NULL OR NEW.material_variant_id IS NOT NULL)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Outbound detail must match its order item kind';
  END IF;
END;

CREATE TRIGGER trg_inventory_transaction_order_guard BEFORE INSERT ON inventory_transaction
FOR EACH ROW FOLLOWS trg_inventory_transaction_source_guard
BEGIN
  DECLARE actual_order_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE actual_order_no VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL;
  DECLARE original_order_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE original_order_no VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL;
  DECLARE source_closed TINYINT DEFAULT NULL;
  IF NEW.reversal_of_transaction_id IS NOT NULL THEN
    SELECT reference_order_id,reference_order_no_snapshot INTO original_order_id,original_order_no
    FROM inventory_transaction WHERE id=NEW.reversal_of_transaction_id;
    IF NOT(NEW.reference_order_id <=> original_order_id)
      OR NOT(CAST(NEW.reference_order_no_snapshot AS BINARY) <=> CAST(original_order_no AS BINARY)) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='A reversal must copy its original inventory order identity';
    END IF;
  END IF;
  IF NEW.reference_type='inbound_detail' THEN
    SELECT o.id,o.inbound_no INTO actual_order_id,actual_order_no
    FROM inbound_detail d JOIN inbound_order o ON o.id=d.inbound_id WHERE d.id=NEW.reference_detail_id FOR UPDATE;
    IF NEW.reversal_of_transaction_id IS NULL THEN
      SELECT receipt_line.inbound_closed INTO source_closed FROM inbound_detail d
      JOIN procurement_receipt_line receipt_line ON receipt_line.id=d.procurement_receipt_line_id
      WHERE d.id=NEW.reference_detail_id AND d.source_type='purchased' FOR SHARE;
      IF source_closed IS NOT NULL AND source_closed<>0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Closed arrival lines cannot post purchase inbounds';
      END IF;
    END IF;
  ELSEIF NEW.reference_type='outbound_detail' THEN
    SELECT o.id,o.outbound_no INTO actual_order_id,actual_order_no
    FROM outbound_detail d JOIN outbound_order o ON o.id=d.outbound_id WHERE d.id=NEW.reference_detail_id FOR UPDATE;
  ELSEIF NEW.reference_type='stock_check_detail' THEN
    SELECT o.id,o.check_no INTO actual_order_id,actual_order_no
    FROM stock_check_detail d JOIN stock_check_order o ON o.id=d.stock_check_id WHERE d.id=NEW.reference_detail_id FOR UPDATE;
  ELSE
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory postings require a direct inventory document source';
  END IF;
  IF actual_order_id IS NULL OR NOT(NEW.reference_order_id <=> actual_order_id)
    OR NOT(CAST(NEW.reference_order_no_snapshot AS BINARY) <=> CAST(actual_order_no AS BINARY)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inventory posting order identity must match its detail parent';
  END IF;
END;

-- Update only catalog wording; existing role grants remain untouched.
UPDATE permissions SET name='到货处理' WHERE code='warehouse:receipts:handle';
