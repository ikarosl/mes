CREATE TABLE procurement_supplier (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplier_name VARCHAR(100) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 0,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_procurement_supplier_name (supplier_name),
  KEY idx_procurement_supplier_list (is_deleted,supplier_name,id),
  CONSTRAINT fk_procurement_supplier_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_procurement_supplier_updater FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_procurement_supplier_deleter FOREIGN KEY (deleted_by) REFERENCES users(id),
  CONSTRAINT chk_procurement_supplier_name CHECK (
    CHAR_LENGTH(supplier_name)>0 AND CHAR_LENGTH(supplier_name)=CHAR_LENGTH(TRIM(supplier_name))
  ),
  CONSTRAINT chk_procurement_supplier_version CHECK (version>=0),
  CONSTRAINT chk_procurement_supplier_deleted CHECK (is_deleted IN (0,1)),
  CONSTRAINT chk_procurement_supplier_deletion CHECK (
    (is_deleted=0 AND deleted_by IS NULL AND deleted_at IS NULL)
    OR (is_deleted=1 AND deleted_by IS NOT NULL AND deleted_at IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
VALUES (NULL,'采购管理','procurement:view','menu','/procurement',NULL,NULL,240,1)
ON DUPLICATE KEY UPDATE name=VALUES(name),type=VALUES(type),route_path=VALUES(route_path),
  sort_order=VALUES(sort_order),status=1,deleted_at=NULL;

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'供应商配置','procurement:suppliers:view','page','/procurement/suppliers',
  'GET','/api/procurement/suppliers*',241,1
FROM permissions WHERE code='procurement:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),
  route_path=VALUES(route_path),api_method=VALUES(api_method),api_path=VALUES(api_path),
  sort_order=VALUES(sort_order),status=1,deleted_at=NULL;

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'新增供应商','procurement:suppliers:create','button',NULL,
  'POST','/api/procurement/suppliers',242,1
FROM permissions WHERE code='procurement:suppliers:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),
  api_method=VALUES(api_method),api_path=VALUES(api_path),sort_order=VALUES(sort_order),
  status=1,deleted_at=NULL;

INSERT INTO permissions (parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'修改供应商','procurement:suppliers:update','button',NULL,
  'PATCH','/api/procurement/suppliers/:id',243,1
FROM permissions WHERE code='procurement:suppliers:view'
ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),type=VALUES(type),
  api_method=VALUES(api_method),api_path=VALUES(api_path),sort_order=VALUES(sort_order),
  status=1,deleted_at=NULL;
