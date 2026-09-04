-- Product architecture boundary:
-- 1. products is the stable BOM identity. For a material, products.item_code is the
--    immutable base code (for example m1.077.012), and the shared name/category/unit
--    live only on this row.
-- 2. material_variants is the exact stock identity (for example
--    m1.077.012-v1-A). A BOM never references this table.
-- 3. Every enabled, non-deleted variant below the same material_product_id is
--    universally interchangeable wherever that base material occurs in a BOM.
--    There is deliberately no route/BOM/version compatibility matrix.
-- 4. "semi-finished" is not a product kind. It is represented by an ordinary
--    material category and consequently cannot own a BOM, route or production order.

UPDATE product_categories
SET item_kind = 'material'
WHERE item_kind = 'semi_finished';

ALTER TABLE product_categories
  DROP CHECK chk_product_categories_kind,
  ADD CONSTRAINT chk_product_categories_kind
    CHECK (item_kind IN ('material', 'finished_product'));

CREATE TABLE material_variants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  material_product_id BIGINT UNSIGNED NOT NULL,
  major_version VARCHAR(32) NOT NULL,
  minor_version VARCHAR(32) NOT NULL,
  variant_code VARCHAR(180) NOT NULL,
  status TINYINT NOT NULL DEFAULT 1,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_material_variants_code (variant_code),
  UNIQUE KEY uk_material_variants_version (
    material_product_id,
    major_version,
    minor_version
  ),
  UNIQUE KEY uk_material_variants_material_reference (id, material_product_id),
  KEY idx_material_variants_material_status (
    material_product_id,
    status,
    is_deleted,
    id
  ),
  CONSTRAINT chk_material_variants_major_version CHECK (
    CHAR_LENGTH(TRIM(major_version)) > 0
  ),
  CONSTRAINT chk_material_variants_minor_version CHECK (
    CHAR_LENGTH(TRIM(minor_version)) > 0
  ),
  CONSTRAINT chk_material_variants_code CHECK (
    CHAR_LENGTH(TRIM(variant_code)) > 0
  ),
  CONSTRAINT chk_material_variants_status CHECK (status IN (0, 1)),
  CONSTRAINT chk_material_variants_deleted CHECK (is_deleted IN (0, 1)),
  CONSTRAINT chk_material_variants_delete_facts CHECK (
    (is_deleted = 0 AND deleted_by IS NULL AND deleted_at IS NULL)
    OR
    (is_deleted = 1 AND deleted_by IS NOT NULL AND deleted_at IS NOT NULL)
  ),
  CONSTRAINT fk_material_variants_material FOREIGN KEY (material_product_id)
    REFERENCES products(id),
  CONSTRAINT fk_material_variants_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_material_variants_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_material_variants_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Codes are external business identities, not editable display fields. Corrections
-- require a new master row/version and disabling the incorrect one.
CREATE TRIGGER trg_products_reject_item_code_update
BEFORE UPDATE ON products
FOR EACH ROW
BEGIN
  IF NOT (NEW.item_code <=> OLD.item_code) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'product item_code is immutable';
  END IF;
END;

CREATE TRIGGER trg_material_variants_reject_identity_update
BEFORE UPDATE ON material_variants
FOR EACH ROW
BEGIN
  IF NOT (NEW.material_product_id <=> OLD.material_product_id)
    OR NOT (NEW.major_version <=> OLD.major_version)
    OR NOT (NEW.minor_version <=> OLD.minor_version)
    OR NOT (NEW.variant_code <=> OLD.variant_code) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material variant identity is immutable';
  END IF;
END;

-- Routes describe reusable execution order only. Material consumption belongs to
-- the finished-product BOM and production demand selection, never to a route step.
DROP TABLE route_step_materials;

ALTER TABLE production_scrap_supplement_plan
  DROP FOREIGN KEY fk_production_scrap_supplement_plan_material_end_step,
  DROP COLUMN material_end_step_record_id;

ALTER TABLE batch_step_scrap_reproduction_authorization
  DROP FOREIGN KEY fk_scrap_reproduction_authorization_material_end_step,
  DROP COLUMN material_end_step_record_id;

INSERT INTO permissions
  (parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
SELECT id, '物料版本', 'product:material-variants:view', 'page',
  '/product/material-variants', 'GET', '/api/product/material-variants', 116, 1
FROM permissions WHERE code = 'product:view'
UNION ALL
SELECT id, '新增物料版本', 'product:material-variants:create', 'api',
  NULL, 'POST', '/api/product/material-variants', 117, 1
FROM permissions WHERE code = 'product:view'
UNION ALL
SELECT id, '变更物料版本状态', 'product:material-variants:change-status', 'api',
  NULL, 'PATCH', '/api/product/material-variants/:id/status', 118, 1
FROM permissions WHERE code = 'product:view'
ON DUPLICATE KEY UPDATE
  parent_id = VALUES(parent_id),
  name = VALUES(name),
  type = VALUES(type),
  route_path = VALUES(route_path),
  api_method = VALUES(api_method),
  api_path = VALUES(api_path),
  sort_order = VALUES(sort_order),
  status = 1,
  deleted_at = NULL;
