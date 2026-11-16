-- Stop all affected writers and verify the matching backup before structural downgrade.
-- Guard before any permanent DDL: real bypassed effects cannot acquire invented approval history.
CREATE TEMPORARY TABLE tmp_optional_approval_down_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_optional_approval_no_bypassed_effect CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_optional_approval_down_guard (invalid_data)
SELECT 1 WHERE
 EXISTS(SELECT 1 FROM products WHERE bom_status='approved' AND bom_approval_instance_id IS NULL) OR
 EXISTS(SELECT 1 FROM production_demand_correction WHERE applied_at IS NOT NULL AND approval_instance_id IS NULL);
DROP TEMPORARY TABLE tmp_optional_approval_down_guard;

ALTER TABLE products
 DROP CHECK chk_products_bom_status,
 ADD CONSTRAINT chk_products_bom_status CHECK(
  (bom_status='draft' AND bom_approval_instance_id IS NULL AND bom_locked_at IS NULL AND bom_locked_by IS NULL) OR
  (bom_status='pending_approval' AND bom_approval_instance_id IS NOT NULL AND bom_locked_at IS NULL AND bom_locked_by IS NULL) OR
  (bom_status='approved' AND bom_approval_instance_id IS NOT NULL AND bom_locked_at IS NOT NULL AND bom_locked_by IS NOT NULL));

ALTER TABLE production_demand_correction
 DROP CHECK chk_correction_effect,
 ADD CONSTRAINT chk_correction_effect CHECK(
  (applied_at IS NULL AND applied_by IS NULL AND new_demand_id IS NULL) OR
  (applied_at IS NOT NULL AND applied_by IS NOT NULL AND ended_at IS NOT NULL AND approval_instance_id IS NOT NULL
   AND ((new_remaining_quantity=0 AND new_demand_id IS NULL) OR (new_remaining_quantity>0 AND new_demand_id IS NOT NULL))));

ALTER TABLE approval_flow_definitions
 DROP CHECK chk_approval_flow_definitions_enabled,
 DROP COLUMN is_enabled;
