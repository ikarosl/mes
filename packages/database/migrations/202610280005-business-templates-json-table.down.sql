-- General tables cannot be losslessly restored to Product name/unit presets.
-- Include disabled and deleted templates in the rollback guard.
CREATE TEMPORARY TABLE tmp_business_templates_json_table_rollback_guard (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_business_templates_json_table_rollback_guard CHECK (must_be_zero=0)
) ENGINE=MEMORY;

INSERT INTO tmp_business_templates_json_table_rollback_guard (must_be_zero)
SELECT 1 FROM business_templates LIMIT 1;

DROP TEMPORARY TABLE tmp_business_templates_json_table_rollback_guard;

ALTER TABLE business_templates
  DROP CHECK chk_business_templates_content,
  DROP INDEX uk_business_templates_name,
  DROP INDEX idx_business_templates_status_name,
  ADD COLUMN scene_code VARCHAR(100) NOT NULL AFTER name,
  ADD UNIQUE KEY uk_business_templates_scene_name (scene_code,name),
  ADD KEY idx_business_templates_scene_status_name (scene_code,is_deleted,status,name,id),
  ADD CONSTRAINT chk_business_templates_scene CHECK (scene_code IN ('product.spec_parameters')),
  ADD CONSTRAINT chk_business_templates_content CHECK (JSON_TYPE(content)='OBJECT');
