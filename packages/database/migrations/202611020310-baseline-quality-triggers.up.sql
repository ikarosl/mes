-- One-time 20261102 baseline: phase 3, quality.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Trigger DATABASE_COLLATION is captured when created, so reject a different default.
CREATE TEMPORARY TABLE tmp_baseline_0310_collation_guard (
  invalid_collation TINYINT NOT NULL,
  CONSTRAINT chk_baseline_0310_collation CHECK (invalid_collation = 0)
) ENGINE=MEMORY;
INSERT INTO tmp_baseline_0310_collation_guard (invalid_collation)
SELECT 1 FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = DATABASE()
  AND (DEFAULT_CHARACTER_SET_NAME <> 'utf8mb4'
       OR DEFAULT_COLLATION_NAME <> 'utf8mb4_0900_ai_ci');
DROP TEMPORARY TABLE tmp_baseline_0310_collation_guard;

SET @baseline_saved_sql_mode = @@SESSION.sql_mode;
SET @baseline_saved_character_set_client = @@SESSION.character_set_client;
SET @baseline_saved_collation_connection = @@SESSION.collation_connection;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_quality_record_no_update` BEFORE UPDATE ON `quality_inspection_record` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inspection records are immutable';

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_quality_record_no_delete` BEFORE DELETE ON `quality_inspection_record` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inspection records are immutable';

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_process_inspection_record_no_update` BEFORE UPDATE ON `quality_process_inspection_record` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Process inspection records are immutable';

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_process_inspection_record_no_delete` BEFORE DELETE ON `quality_process_inspection_record` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Process inspection records are immutable';

SET SESSION sql_mode = @baseline_saved_sql_mode;
SET SESSION character_set_client = @baseline_saved_character_set_client;
SET SESSION collation_connection = @baseline_saved_collation_connection;
SET @baseline_saved_sql_mode = NULL;
SET @baseline_saved_character_set_client = NULL;
SET @baseline_saved_collation_connection = NULL;
