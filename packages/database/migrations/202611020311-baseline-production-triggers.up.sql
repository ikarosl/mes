-- One-time 20261102 baseline: phase 3, production.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Trigger DATABASE_COLLATION is captured when created, so reject a different default.
CREATE TEMPORARY TABLE tmp_baseline_0311_collation_guard (
  invalid_collation TINYINT NOT NULL,
  CONSTRAINT chk_baseline_0311_collation CHECK (invalid_collation = 0)
) ENGINE=MEMORY;
INSERT INTO tmp_baseline_0311_collation_guard (invalid_collation)
SELECT 1 FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = DATABASE()
  AND (DEFAULT_CHARACTER_SET_NAME <> 'utf8mb4'
       OR DEFAULT_COLLATION_NAME <> 'utf8mb4_0900_ai_ci');
DROP TEMPORARY TABLE tmp_baseline_0311_collation_guard;

SET @baseline_saved_sql_mode = @@SESSION.sql_mode;
SET @baseline_saved_character_set_client = @@SESSION.character_set_client;
SET @baseline_saved_collation_connection = @@SESSION.collation_connection;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_step_execution_action_no_update` BEFORE UPDATE ON `batch_step_execution_actions` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Production execution actions are immutable';

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_step_execution_action_no_delete` BEFORE DELETE ON `batch_step_execution_actions` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Production execution actions are immutable';

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_closeout_material_loss_insert` BEFORE INSERT ON `item_scrap` FOR EACH ROW BEGIN
  IF NEW.loss_purpose='closeout_record' AND NOT EXISTS (
    SELECT 1 FROM production_batch_closeout c JOIN production_batches b ON b.id=c.production_batch_id
    WHERE c.id=NEW.closeout_id AND b.id=NEW.production_batch_id AND b.status='closing'
      AND c.pending_approval_id IS NULL AND c.current_revision_id IS NULL
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Closeout material loss requires an editable initial closing task';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_closeout_material_loss_no_update` BEFORE UPDATE ON `item_scrap` FOR EACH ROW BEGIN
  IF OLD.status<>'pending' OR NEW.status NOT IN ('confirmed','cancelled')
    OR NEW.loss_purpose<>OLD.loss_purpose OR NOT (NEW.closeout_id <=> OLD.closeout_id)
    OR NEW.production_batch_id<>OLD.production_batch_id OR NEW.demand_id<>OLD.demand_id
    OR NEW.allocation_id<>OLD.allocation_id OR NEW.item_id<>OLD.item_id
    OR NEW.material_variant_id<>OLD.material_variant_id OR NEW.batch_id<>OLD.batch_id
    OR NEW.scrap_scene<>OLD.scrap_scene OR NEW.scrap_number<>OLD.scrap_number
    OR NEW.scrap_no<>OLD.scrap_no OR NEW.unit_snapshot<>OLD.unit_snapshot
    OR NEW.reason_type<>OLD.reason_type OR NOT (NEW.remark <=> OLD.remark)
    OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at
    OR NEW.version<>OLD.version+1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Material loss source and terminal facts are immutable';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_closeout_material_loss_no_delete` BEFORE DELETE ON `item_scrap` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Material loss records cannot be deleted';

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_closeout_action_no_update` BEFORE UPDATE ON `production_batch_closeout_action` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Closeout actions are immutable';

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_closeout_action_no_delete` BEFORE DELETE ON `production_batch_closeout_action` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Closeout actions are immutable';

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_demand_task_policy_insert` BEFORE INSERT ON `production_item_demand` FOR EACH ROW BEGIN
  DECLARE order_kind VARCHAR(30);
  SELECT w.order_type INTO order_kind FROM production_batches b JOIN work_orders w ON w.id=b.work_order_id WHERE b.id=NEW.production_batch_id;
  IF order_kind IS NULL OR (order_kind='mass_production' AND NEW.requirement_basis_id IS NULL)
    OR (order_kind='research' AND NEW.requirement_basis_id IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='demand BOM source must match task order type';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_demand_material_facts_update` BEFORE UPDATE ON `production_item_demand` FOR EACH ROW BEGIN
  IF NEW.production_batch_id<>OLD.production_batch_id OR NOT (NEW.requirement_basis_id<=>OLD.requirement_basis_id)
    OR NOT (NEW.product_material_id<=>OLD.product_material_id) OR NEW.item_id<>OLD.item_id OR NEW.material_variant_id<>OLD.material_variant_id
    OR NOT (NEW.quantity_per_unit_snapshot<=>OLD.quantity_per_unit_snapshot) OR NOT (NEW.planned_output_quantity_snapshot<=>OLD.planned_output_quantity_snapshot)
    OR NEW.unit_snapshot<>OLD.unit_snapshot OR NEW.need_number<>OLD.need_number OR NOT (NEW.supplier_hint<=>OLD.supplier_hint) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='confirmed demand material and quantity facts are immutable';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_requirement_basis_mass_insert` BEFORE INSERT ON `production_material_requirement_basis` FOR EACH ROW BEGIN
  DECLARE order_kind VARCHAR(30);
  SELECT w.order_type INTO order_kind FROM production_batches b JOIN work_orders w ON w.id=b.work_order_id WHERE b.id=NEW.production_batch_id;
  IF order_kind IS NULL OR order_kind<>'mass_production' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BOM basis is only available for mass production tasks';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_requirement_basis_immutable_update` BEFORE UPDATE ON `production_material_requirement_basis` FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='confirmed task material basis is immutable';
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_requirement_basis_immutable_delete` BEFORE DELETE ON `production_material_requirement_basis` FOR EACH ROW BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='confirmed task material basis is immutable';
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_output_allocation_no_update` BEFORE UPDATE ON `production_output_allocation` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Output allocations are immutable';

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_output_allocation_no_delete` BEFORE DELETE ON `production_output_allocation` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Output allocations are immutable';

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_output_revision_no_update` BEFORE UPDATE ON `production_output_revision` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Approved output revisions are immutable';

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_output_revision_no_delete` BEFORE DELETE ON `production_output_revision` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Approved output revisions are immutable';

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_output_round_identity_update` BEFORE UPDATE ON `production_output_round` FOR EACH ROW BEGIN
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

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_work_orders_reject_released_type_update` BEFORE UPDATE ON `work_orders` FOR EACH ROW BEGIN
  IF NOT (NEW.order_type <=> OLD.order_type) AND OLD.status <> 'draft' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'released work order type is immutable';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_work_orders_reject_number_update` BEFORE UPDATE ON `work_orders` FOR EACH ROW FOLLOWS `trg_work_orders_reject_released_type_update` BEGIN
  IF NOT (NEW.work_order_no <=> OLD.work_order_no) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Work order number is immutable';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_work_orders_reject_research_lineage_update` BEFORE UPDATE ON `work_orders` FOR EACH ROW FOLLOWS `trg_work_orders_reject_number_update` BEGIN
  IF NOT (NEW.previous_research_order_id <=> OLD.previous_research_order_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Research predecessor is immutable';
  END IF;
END;

SET SESSION sql_mode = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET SESSION character_set_client = 'utf8mb4';
SET SESSION collation_connection = 'utf8mb4_general_ci';

CREATE TRIGGER `trg_work_orders_reject_self_research` AFTER INSERT ON `work_orders` FOR EACH ROW BEGIN
  IF NEW.previous_research_order_id=NEW.id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Research work order cannot refer to itself';
  END IF;
END;

SET SESSION sql_mode = @baseline_saved_sql_mode;
SET SESSION character_set_client = @baseline_saved_character_set_client;
SET SESSION collation_connection = @baseline_saved_collation_connection;
SET @baseline_saved_sql_mode = NULL;
SET @baseline_saved_character_set_client = NULL;
SET @baseline_saved_collation_connection = NULL;
