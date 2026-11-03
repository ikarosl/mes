-- Pause Template and incoming-inspection writes before this guard and all subsequent statements.
-- Only the untouched initialization may be removed. Saved business tables own independent JSON.
CREATE TEMPORARY TABLE tmp_template_scene_defaults_down_guard (
  incompatible_data TINYINT NOT NULL,
  CONSTRAINT chk_template_scene_defaults_unchanged CHECK (incompatible_data = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_template_scene_defaults_down_guard (incompatible_data)
SELECT 1
WHERE (SELECT COUNT(*) FROM business_template_defaults) <> 1
   OR NOT EXISTS (
     SELECT 1 FROM business_template_defaults d
     JOIN business_templates t ON t.id = d.template_id
     WHERE d.scene_code = 'quality_incoming_inspection'
       AND d.version = 0 AND d.is_deleted = 0
       AND d.created_by IS NULL AND d.updated_by IS NULL
       AND d.deleted_by IS NULL AND d.deleted_at IS NULL
       AND d.created_at = d.updated_at
       AND t.name = '来料检验初始模板'
       AND t.status = 'enabled' AND t.version = 0 AND t.is_deleted = 0
       AND t.created_by IS NULL AND t.updated_by IS NULL
       AND t.deleted_by IS NULL AND t.deleted_at IS NULL
       AND t.created_at = t.updated_at
       AND t.content = CAST('{"columns":[{"key":"project","label":"检验项目"},{"key":"requirement","label":"验收要求"},{"key":"tool","label":"检查方式"},{"key":"description","label":"检验描述"},{"key":"result","label":"检验结果"}],"rows":[{"project":"外观","requirement":"","tool":"目视","description":"","result":""},{"project":"包装要求","requirement":"","tool":"目视","description":"","result":""},{"project":"材料证明","requirement":"","tool":"目视","description":"","result":""},{"project":"数量","requirement":"","tool":"目视","description":"","result":""}]}' AS JSON)
       AND t.column_rules = CAST('{"project":"fixed","requirement":"optional","tool":"fixed","description":"required","result":"required"}' AS JSON)
   )
   OR EXISTS (
     SELECT 1 FROM business_templates
     WHERE column_rules IS NOT NULL
       AND id NOT IN (SELECT template_id FROM business_template_defaults WHERE template_id IS NOT NULL)
   );

DROP TEMPORARY TABLE tmp_template_scene_defaults_down_guard;

CREATE TEMPORARY TABLE tmp_template_scene_defaults_initial_template (
  id BIGINT UNSIGNED NOT NULL PRIMARY KEY
) ENGINE=MEMORY;

INSERT INTO tmp_template_scene_defaults_initial_template (id)
SELECT template_id FROM business_template_defaults WHERE scene_code = 'quality_incoming_inspection';

DROP TABLE business_template_defaults;

DELETE FROM business_templates
WHERE id IN (SELECT id FROM tmp_template_scene_defaults_initial_template);

DROP TEMPORARY TABLE tmp_template_scene_defaults_initial_template;

ALTER TABLE business_templates
  DROP CHECK chk_business_templates_column_rules,
  DROP COLUMN column_rules;
