-- Stop Approval configuration/submission/decision, Product BOM and demand-correction writers.
-- Keep a verified backup with the matching application; partial up requires explicit recovery.
-- A non-empty published pointer must already identify a usable published version.
CREATE TEMPORARY TABLE tmp_optional_approval_up_guard (
 invalid_data TINYINT NOT NULL,
 CONSTRAINT chk_optional_approval_published_valid CHECK(invalid_data=0)
) ENGINE=MEMORY;
INSERT INTO tmp_optional_approval_up_guard (invalid_data)
SELECT 1 WHERE EXISTS (
 SELECT 1 FROM approval_flow_definitions d
 LEFT JOIN approval_flow_versions v
   ON v.id=d.published_version_id AND v.definition_id=d.id
  AND v.status='published' AND v.is_deleted=0
 WHERE d.is_deleted=0 AND d.published_version_id IS NOT NULL AND v.id IS NULL
);
DROP TEMPORARY TABLE tmp_optional_approval_up_guard;

ALTER TABLE approval_flow_definitions
 ADD COLUMN is_enabled TINYINT NOT NULL DEFAULT 0 AFTER published_version_id,
 ADD CONSTRAINT chk_approval_flow_definitions_enabled
  CHECK(is_enabled IN (0,1) AND (is_enabled=0 OR published_version_id IS NOT NULL));

-- Preserve the existing mandatory-approval behavior of valid published definitions.
-- Current personnel eligibility is deliberately not used to infer a new historical setting.
UPDATE approval_flow_definitions d
JOIN approval_flow_versions v
  ON v.id=d.published_version_id AND v.definition_id=d.id
 AND v.status='published' AND v.is_deleted=0
SET d.is_enabled=1,d.updated_at=d.updated_at
WHERE d.is_deleted=0;

ALTER TABLE products
 DROP CHECK chk_products_bom_status,
 ADD CONSTRAINT chk_products_bom_status CHECK(
  (bom_status='draft' AND bom_approval_instance_id IS NULL AND bom_locked_at IS NULL AND bom_locked_by IS NULL) OR
  (bom_status='pending_approval' AND bom_approval_instance_id IS NOT NULL AND bom_locked_at IS NULL AND bom_locked_by IS NULL) OR
  (bom_status='approved' AND bom_locked_at IS NOT NULL AND bom_locked_by IS NOT NULL));

-- Keep the current post-retirement effect invariant; no result_snapshot column exists.
ALTER TABLE production_demand_correction
 DROP CHECK chk_correction_effect,
 ADD CONSTRAINT chk_correction_effect CHECK(
  (applied_at IS NULL AND applied_by IS NULL AND new_demand_id IS NULL) OR
  (applied_at IS NOT NULL AND applied_by IS NOT NULL AND ended_at IS NOT NULL
   AND ((new_remaining_quantity=0 AND new_demand_id IS NULL) OR (new_remaining_quantity>0 AND new_demand_id IS NOT NULL))));
