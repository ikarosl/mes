-- One-time 20261102 baseline: phase 3, product.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Trigger DATABASE_COLLATION is captured when created, so reject a different default.
CREATE TEMPORARY TABLE tmp_baseline_0305_collation_guard (
  invalid_collation TINYINT NOT NULL,
  CONSTRAINT chk_baseline_0305_collation CHECK (invalid_collation = 0)
) ENGINE=MEMORY;
INSERT INTO tmp_baseline_0305_collation_guard (invalid_collation)
SELECT 1 FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = DATABASE()
  AND (DEFAULT_CHARACTER_SET_NAME <> 'utf8mb4'
       OR DEFAULT_COLLATION_NAME <> 'utf8mb4_0900_ai_ci');
DROP TEMPORARY TABLE tmp_baseline_0305_collation_guard;

SET @baseline_saved_sql_mode = @@SESSION.sql_mode;
SET @baseline_saved_character_set_client = @@SESSION.character_set_client;
SET @baseline_saved_collation_connection = @@SESSION.collation_connection;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_material_variants_reject_identity_update` BEFORE UPDATE ON `material_variants` FOR EACH ROW BEGIN
  IF NOT (NEW.material_id <=> OLD.material_id)
    OR NOT (NEW.major_version <=> OLD.major_version)
    OR NOT (NEW.minor_version <=> OLD.minor_version)
    OR NOT (NEW.variant_code <=> OLD.variant_code) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material variant identity is immutable';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_materials_reject_identity_update` BEFORE UPDATE ON `materials` FOR EACH ROW BEGIN
  IF NOT (NEW.material_code <=> OLD.material_code) OR NOT (NEW.unit <=> OLD.unit) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material code and unit are immutable';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_products_reject_item_code_update` BEFORE UPDATE ON `products` FOR EACH ROW BEGIN
  IF NOT (NEW.item_code <=> OLD.item_code) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'product item_code is immutable';
  END IF;
END;

SET SESSION sql_mode = @baseline_saved_sql_mode;
SET SESSION character_set_client = @baseline_saved_character_set_client;
SET SESSION collation_connection = @baseline_saved_collation_connection;
SET @baseline_saved_sql_mode = NULL;
SET @baseline_saved_character_set_client = NULL;
SET @baseline_saved_collation_connection = NULL;
