-- One-time 20261102 baseline: phase 3, procurement.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Trigger DATABASE_COLLATION is captured when created, so reject a different default.
CREATE TEMPORARY TABLE tmp_baseline_0309_collation_guard (
  invalid_collation TINYINT NOT NULL,
  CONSTRAINT chk_baseline_0309_collation CHECK (invalid_collation = 0)
) ENGINE=MEMORY;
INSERT INTO tmp_baseline_0309_collation_guard (invalid_collation)
SELECT 1 FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = DATABASE()
  AND (DEFAULT_CHARACTER_SET_NAME <> 'utf8mb4'
       OR DEFAULT_COLLATION_NAME <> 'utf8mb4_0900_ai_ci');
DROP TEMPORARY TABLE tmp_baseline_0309_collation_guard;

SET @baseline_saved_sql_mode = @@SESSION.sql_mode;
SET @baseline_saved_character_set_client = @@SESSION.character_set_client;
SET @baseline_saved_collation_connection = @@SESSION.collation_connection;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_procurement_order_supplier_frozen` BEFORE UPDATE ON `procurement_order` FOR EACH ROW BEGIN
  IF NEW.supplier_id<>OLD.supplier_id
    AND (OLD.status<>'draft' OR OLD.ordered_at IS NOT NULL OR OLD.supplement_reason IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Ordered and supplement purchase suppliers are immutable';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_procurement_order_line_amounts_frozen` BEFORE UPDATE ON `procurement_order_line` FOR EACH ROW BEGIN
  IF NEW.planned_quantity<>OLD.planned_quantity
    AND (OLD.status<>'draft' OR EXISTS(
      SELECT 1 FROM procurement_order source_order
      WHERE source_order.id=OLD.purchase_order_id
        AND (source_order.status<>'draft' OR source_order.ordered_at IS NOT NULL)
    )) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Ordered purchase quantity is immutable';
  END IF;
  IF (NOT (BINARY NEW.tax_exclusive_amount <=> BINARY OLD.tax_exclusive_amount)
      OR NOT (BINARY NEW.tax_inclusive_amount <=> BINARY OLD.tax_inclusive_amount)
      OR NEW.tax_rate_percent<>OLD.tax_rate_percent
      OR NOT (BINARY NEW.total_amount <=> BINARY OLD.total_amount)
      OR NOT (BINARY NEW.total_amount_source <=> BINARY OLD.total_amount_source))
    AND (OLD.status<>'draft' OR EXISTS(
      SELECT 1 FROM procurement_order source_order
      WHERE source_order.id=OLD.purchase_order_id
        AND (source_order.status<>'draft' OR source_order.ordered_at IS NOT NULL)
    ))
    AND (OLD.status NOT IN('open','closed') OR NEW.status NOT IN('open','closed') OR NOT EXISTS(
      SELECT 1 FROM procurement_order source_order
      WHERE source_order.id=OLD.purchase_order_id AND source_order.status IN('ordered','completed')
    )) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Purchase amount corrections require an ordered or completed purchase';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_procurement_receipt_void_update` BEFORE UPDATE ON `procurement_receipt` FOR EACH ROW BEGIN
  IF NOT(NEW.id <=> OLD.id)
    OR NOT(CAST(NEW.receipt_no AS BINARY) <=> CAST(OLD.receipt_no AS BINARY))
    OR NOT(NEW.purchase_order_id <=> OLD.purchase_order_id)
    OR NOT(NEW.received_at <=> OLD.received_at)
    OR NOT(CAST(NEW.handover_evidence AS BINARY) <=> CAST(OLD.handover_evidence AS BINARY))
    OR NOT(CAST(NEW.remark AS BINARY) <=> CAST(OLD.remark AS BINARY))
    OR NOT(NEW.created_by <=> OLD.created_by) OR NOT(NEW.created_at <=> OLD.created_at) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt registration fields are immutable';
  END IF;
  IF OLD.is_voided<>0 OR NEW.is_voided<>1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt can only be voided once';
  END IF;
  IF NEW.version<>OLD.version+1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt void must increment version once';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_procurement_receipt_no_delete` BEFORE DELETE ON `procurement_receipt` FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Procurement receipt facts are immutable';
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_procurement_receipt_acceptance_no_update` BEFORE UPDATE ON `procurement_receipt_acceptance` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt acceptance facts are immutable';

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_procurement_receipt_acceptance_no_delete` BEFORE DELETE ON `procurement_receipt_acceptance` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt acceptance facts are immutable';

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_receipt_allocation_no_update` BEFORE UPDATE ON `procurement_receipt_allocation` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt allocation facts are immutable';

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_receipt_allocation_no_delete` BEFORE DELETE ON `procurement_receipt_allocation` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt allocation facts are immutable';

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_procurement_receipt_identity_update` BEFORE UPDATE ON `procurement_receipt_line` FOR EACH ROW BEGIN
  IF NOT (NEW.receipt_id <=> OLD.receipt_id) OR NOT (NEW.purchase_order_id <=> OLD.purchase_order_id)
    OR NOT (NEW.purchase_order_line_id <=> OLD.purchase_order_line_id) OR NOT (NEW.item_id <=> OLD.item_id)
    OR NOT (NEW.material_variant_id <=> OLD.material_variant_id) OR NOT (NEW.supplier_batch_code <=> OLD.supplier_batch_code) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt source identity cannot change';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_procurement_receipt_revision_no_update` BEFORE UPDATE ON `procurement_receipt_revision` FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Procurement receipt facts are immutable';
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_procurement_receipt_revision_no_delete` BEFORE DELETE ON `procurement_receipt_revision` FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Procurement receipt facts are immutable';
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_procurement_supplier_return_no_update` BEFORE UPDATE ON `procurement_supplier_return` FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Procurement receipt facts are immutable';
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_procurement_supplier_return_no_delete` BEFORE DELETE ON `procurement_supplier_return` FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Procurement receipt facts are immutable';
END;

SET SESSION sql_mode = @baseline_saved_sql_mode;
SET SESSION character_set_client = @baseline_saved_character_set_client;
SET SESSION collation_connection = @baseline_saved_collation_connection;
SET @baseline_saved_sql_mode = NULL;
SET @baseline_saved_character_set_client = NULL;
SET @baseline_saved_collation_connection = NULL;
