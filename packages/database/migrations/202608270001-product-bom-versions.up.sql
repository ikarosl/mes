-- 产品 BOM 版本控制：轻量不可变 BOM 版本。
-- 新增 product_bom_versions / product_bom_version_lines，并为 products 增加当前已发布 BOM 版本指针。
-- 当前数据库允许清空重建，因此不迁移、回填或兼容旧 BOM 数据；所有版本均通过新入口重新创建。
CREATE TABLE product_bom_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  version_no VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  change_reason TEXT NULL,
  remark TEXT NULL,
  published_by BIGINT UNSIGNED NULL,
  published_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  draft_product_guard BIGINT UNSIGNED
    GENERATED ALWAYS AS (
      CASE WHEN status = 'draft' AND is_deleted = 0 THEN product_id ELSE NULL END
    ) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uk_product_bom_versions_no (product_id, version_no),
  UNIQUE KEY uk_product_bom_versions_one_draft (draft_product_guard),
  UNIQUE KEY uk_product_bom_versions_reference (id, product_id),
  CONSTRAINT chk_product_bom_versions_status CHECK (status IN ('draft', 'published', 'superseded')),
  CONSTRAINT chk_product_bom_versions_deleted CHECK (is_deleted IN (0, 1)),
  CONSTRAINT fk_product_bom_versions_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_product_bom_versions_published_by FOREIGN KEY (published_by) REFERENCES users(id),
  CONSTRAINT fk_product_bom_versions_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_product_bom_versions_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_product_bom_versions_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE product_bom_version_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bom_version_id BIGINT UNSIGNED NOT NULL,
  line_no INT NOT NULL,
  material_product_id BIGINT UNSIGNED NOT NULL,
  quantity_per_unit DECIMAL(12,4) NOT NULL,
  item_code_snapshot VARCHAR(100) NOT NULL,
  item_name_snapshot VARCHAR(200) NOT NULL,
  unit_snapshot VARCHAR(20) NOT NULL,
  is_key_material TINYINT NOT NULL DEFAULT 1,
  need_batch_record TINYINT NOT NULL DEFAULT 1,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT NOT NULL DEFAULT 0,
  deleted_by BIGINT UNSIGNED NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_product_bom_version_lines_material (bom_version_id, material_product_id),
  UNIQUE KEY uk_product_bom_version_lines_no (bom_version_id, line_no),
  UNIQUE KEY uk_product_bom_version_lines_reference (id, bom_version_id),
  CONSTRAINT chk_product_bom_version_lines_quantity CHECK (
    quantity_per_unit > 0
    AND quantity_per_unit = TRUNCATE(quantity_per_unit, 0)
  ),
  CONSTRAINT chk_product_bom_version_lines_flags CHECK (
    line_no > 0
    AND is_key_material IN (0, 1)
    AND need_batch_record IN (0, 1)
    AND is_deleted IN (0, 1)
  ),
  CONSTRAINT fk_product_bom_version_lines_version FOREIGN KEY (bom_version_id) REFERENCES product_bom_versions(id),
  CONSTRAINT fk_product_bom_version_lines_material FOREIGN KEY (material_product_id) REFERENCES products(id),
  CONSTRAINT fk_product_bom_version_lines_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_product_bom_version_lines_updated_by FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT fk_product_bom_version_lines_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE products
  ADD COLUMN current_bom_version_id BIGINT UNSIGNED NULL AFTER default_route_id,
  ADD KEY idx_products_current_bom_version_owner (current_bom_version_id, id),
  ADD CONSTRAINT fk_products_current_bom_version_owner
    FOREIGN KEY (current_bom_version_id, id)
    REFERENCES product_bom_versions(id, product_id);

-- 只有 draft 版本允许增删改 BOM 行。
CREATE TRIGGER trg_product_bom_lines_reject_non_draft_insert
BEFORE INSERT ON product_bom_version_lines
FOR EACH ROW
BEGIN
  IF (SELECT status FROM product_bom_versions WHERE id = NEW.bom_version_id) <> 'draft' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'product BOM lines are immutable after publication';
  END IF;
END;

CREATE TRIGGER trg_product_bom_lines_reject_non_draft_update
BEFORE UPDATE ON product_bom_version_lines
FOR EACH ROW
BEGIN
  IF (SELECT status FROM product_bom_versions WHERE id = OLD.bom_version_id) <> 'draft' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'product BOM lines are immutable after publication';
  END IF;
END;

CREATE TRIGGER trg_product_bom_lines_reject_non_draft_delete
BEFORE DELETE ON product_bom_version_lines
FOR EACH ROW
BEGIN
  IF (SELECT status FROM product_bom_versions WHERE id = OLD.bom_version_id) <> 'draft' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'product BOM lines are immutable after publication';
  END IF;
END;

DELETE FROM permissions WHERE code = 'product:products:manage-bom';

INSERT INTO permissions (parent_id, name, code, type, route_path, api_method, api_path, sort_order, status)
SELECT id, '查看 BOM 版本', 'product:bom-versions:view', 'api', NULL, 'GET', '/api/product/products/:id/bom-versions', 116, 1
FROM permissions WHERE code = 'product:view'
UNION ALL
SELECT id, '编辑 BOM 草稿', 'product:bom-versions:edit-draft', 'api', NULL, 'PUT', '/api/product/bom-versions/:id/lines', 117, 1
FROM permissions WHERE code = 'product:view'
UNION ALL
SELECT id, '发布 BOM 版本', 'product:bom-versions:publish', 'api', NULL, 'POST', '/api/product/bom-versions/:id/publish', 118, 1
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
