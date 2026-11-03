-- Pause Template and incoming-inspection writes during this additive upgrade.
-- Existing templates retain NULL rules: historical content never implies required/fixed columns.
-- A conflicting initial name requires an explicit rename; do not adopt or overwrite user data.
CREATE TEMPORARY TABLE tmp_template_scene_defaults_up_guard (
  incompatible_data TINYINT NOT NULL,
  CONSTRAINT chk_template_scene_initial_name_free CHECK (incompatible_data = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_template_scene_defaults_up_guard (incompatible_data)
SELECT 1 WHERE EXISTS (
  SELECT 1 FROM business_templates WHERE name = '来料检验初始模板'
);

DROP TEMPORARY TABLE tmp_template_scene_defaults_up_guard;

ALTER TABLE business_templates
  ADD COLUMN column_rules JSON NULL AFTER content,
  ADD CONSTRAINT chk_business_templates_column_rules CHECK (
    column_rules IS NULL OR JSON_SCHEMA_VALID(
      '{"type":"object","additionalProperties":{"type":"string","enum":["fixed","required","optional"]}}',
      column_rules
    )
  );

CREATE TABLE business_template_defaults (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scene_code VARCHAR(64) NOT NULL,
  template_id BIGINT UNSIGNED NULL,
  version INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_business_template_defaults_scene (scene_code),
  KEY fk_business_template_defaults_template (template_id),
  KEY fk_business_template_defaults_created_by (created_by),
  KEY fk_business_template_defaults_updated_by (updated_by),
  KEY fk_business_template_defaults_deleted_by (deleted_by),
  CONSTRAINT fk_business_template_defaults_template FOREIGN KEY (template_id)
    REFERENCES business_templates (id),
  CONSTRAINT fk_business_template_defaults_created_by FOREIGN KEY (created_by)
    REFERENCES users (id),
  CONSTRAINT fk_business_template_defaults_updated_by FOREIGN KEY (updated_by)
    REFERENCES users (id),
  CONSTRAINT fk_business_template_defaults_deleted_by FOREIGN KEY (deleted_by)
    REFERENCES users (id),
  CONSTRAINT chk_business_template_defaults_scene CHECK (
    scene_code IN ('quality_incoming_inspection')
  ),
  CONSTRAINT chk_business_template_defaults_version CHECK (version >= 0),
  CONSTRAINT chk_business_template_defaults_deleted CHECK (
    (is_deleted = 0 AND deleted_by IS NULL AND deleted_at IS NULL)
    OR (is_deleted = 1 AND deleted_by IS NOT NULL AND deleted_at IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Requirements and actual observations remain empty; migration cannot invent acceptance criteria.
INSERT INTO business_templates (name,content,column_rules,status)
VALUES (
  '来料检验初始模板',
  '{"columns":[{"key":"project","label":"检验项目"},{"key":"requirement","label":"验收要求"},{"key":"tool","label":"检查方式"},{"key":"description","label":"检验描述"},{"key":"result","label":"检验结果"}],"rows":[{"project":"外观","requirement":"","tool":"目视","description":"","result":""},{"project":"包装要求","requirement":"","tool":"目视","description":"","result":""},{"project":"材料证明","requirement":"","tool":"目视","description":"","result":""},{"project":"数量","requirement":"","tool":"目视","description":"","result":""}]}',
  '{"project":"fixed","requirement":"optional","tool":"fixed","description":"required","result":"required"}',
  'enabled'
);

INSERT INTO business_template_defaults (scene_code,template_id)
VALUES ('quality_incoming_inspection',LAST_INSERT_ID());
