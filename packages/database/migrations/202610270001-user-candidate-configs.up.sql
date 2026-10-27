CREATE TABLE user_candidate_configs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scene_code VARCHAR(100) NOT NULL,
  version INT NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_candidate_configs_scene (scene_code),
  CONSTRAINT chk_user_candidate_configs_version CHECK (version >= 0),
  CONSTRAINT chk_user_candidate_configs_deleted CHECK (
    (is_deleted=0 AND deleted_by IS NULL AND deleted_at IS NULL)
    OR (is_deleted=1 AND deleted_by IS NOT NULL AND deleted_at IS NOT NULL)
  ),
  CONSTRAINT fk_user_candidate_configs_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_user_candidate_configs_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_user_candidate_configs_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_candidate_config_roles (
  config_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (config_id,role_id),
  KEY idx_user_candidate_config_roles_role (role_id,config_id),
  CONSTRAINT fk_user_candidate_config_roles_config FOREIGN KEY (config_id)
    REFERENCES user_candidate_configs(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_candidate_config_roles_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

START TRANSACTION;

INSERT INTO permissions (
  parent_id,name,code,type,route_path,api_method,api_path,sort_order,status
)
SELECT id,'业务人员配置','system:user-candidates:view','page',
  '/system/user-candidates',NULL,NULL,50,1
FROM permissions WHERE code='system:view'
ON DUPLICATE KEY UPDATE
  parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),
  route_path=VALUES(route_path),api_method=VALUES(api_method),api_path=VALUES(api_path),
  sort_order=VALUES(sort_order);

INSERT INTO permissions (
  parent_id,name,code,type,route_path,api_method,api_path,sort_order,status
)
SELECT id,'配置业务候选角色','system:user-candidates:configure','api',
  NULL,NULL,NULL,10,1
FROM permissions WHERE code='system:user-candidates:view'
ON DUPLICATE KEY UPDATE
  parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),
  route_path=VALUES(route_path),api_method=VALUES(api_method),api_path=VALUES(api_path),
  sort_order=VALUES(sort_order);

COMMIT;
