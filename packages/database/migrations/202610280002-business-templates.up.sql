CREATE TABLE business_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  scene_code VARCHAR(100) NOT NULL,
  content JSON NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'enabled',
  version INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_business_templates_scene_name (scene_code,name),
  KEY idx_business_templates_scene_status_name (scene_code,is_deleted,status,name,id),
  CONSTRAINT chk_business_templates_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_business_templates_content CHECK (JSON_TYPE(content)='OBJECT'),
  CONSTRAINT chk_business_templates_scene CHECK (scene_code IN ('product.spec_parameters')),
  CONSTRAINT chk_business_templates_status CHECK (status IN ('enabled','disabled')),
  CONSTRAINT chk_business_templates_version CHECK (version >= 0),
  CONSTRAINT chk_business_templates_deleted CHECK (
    (is_deleted=0 AND deleted_by IS NULL AND deleted_at IS NULL)
    OR (is_deleted=1 AND deleted_by IS NOT NULL AND deleted_at IS NOT NULL)
  ),
  CONSTRAINT fk_business_templates_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_business_templates_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_business_templates_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
