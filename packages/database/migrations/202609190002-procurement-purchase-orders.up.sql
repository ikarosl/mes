CREATE TABLE purchase_order (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_no VARCHAR(100) NOT NULL,
  supplier_id BIGINT UNSIGNED NOT NULL,
  source_type VARCHAR(30) NOT NULL,
  supplement_reason VARCHAR(30) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  remark TEXT NULL,
  ordered_by BIGINT UNSIGNED NULL,
  ordered_at DATETIME NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY(id),
  UNIQUE KEY uk_purchase_order_no(purchase_no),
  KEY idx_purchase_order_status(status,created_at,id),
  KEY idx_purchase_order_supplier(supplier_id,created_at,id),
  CONSTRAINT fk_purchase_order_supplier FOREIGN KEY(supplier_id) REFERENCES procurement_supplier(id),
  CONSTRAINT fk_purchase_order_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_purchase_order_updater FOREIGN KEY(updated_by) REFERENCES users(id),
  CONSTRAINT fk_purchase_order_orderer FOREIGN KEY(ordered_by) REFERENCES users(id),
  CONSTRAINT chk_purchase_order_source CHECK(source_type IN ('demand','stock')),
  CONSTRAINT chk_purchase_order_supplement CHECK(supplement_reason IS NULL OR supplement_reason IN ('excess_purchase','quality_replacement')),
  CONSTRAINT chk_purchase_order_status CHECK(status IN ('draft','ordered','completed','cancelled')),
  CONSTRAINT chk_purchase_order_version CHECK(version>=0),
  CONSTRAINT chk_purchase_order_ordered CHECK(
    (ordered_at IS NULL AND ordered_by IS NULL AND status IN ('draft','cancelled'))
    OR (ordered_at IS NOT NULL AND ordered_by IS NOT NULL AND status IN ('ordered','completed','cancelled'))
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchase_order_line (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_order_id BIGINT UNSIGNED NOT NULL,
  line_no INT NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  material_variant_id BIGINT UNSIGNED NOT NULL,
  item_code_snapshot VARCHAR(100) NOT NULL,
  material_variant_code_snapshot VARCHAR(180) NOT NULL,
  unit_snapshot VARCHAR(20) NOT NULL,
  planned_quantity INT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  origin_order_line_id BIGINT UNSIGNED NULL,
  supplement_evidence TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY(id),
  UNIQUE KEY uk_purchase_order_line_no(purchase_order_id,line_no),
  UNIQUE KEY uk_purchase_order_line_identity(purchase_order_id,item_id,material_variant_id),
  UNIQUE KEY uk_purchase_order_line_order(id,purchase_order_id),
  UNIQUE KEY uk_purchase_order_line_material(id,item_id,material_variant_id),
  KEY idx_purchase_order_line_origin(origin_order_line_id,id),
  CONSTRAINT fk_purchase_order_line_order FOREIGN KEY(purchase_order_id) REFERENCES purchase_order(id),
  CONSTRAINT fk_purchase_order_line_item FOREIGN KEY(item_id) REFERENCES materials(id),
  CONSTRAINT fk_purchase_order_line_variant FOREIGN KEY(material_variant_id,item_id) REFERENCES material_variants(id,material_id),
  CONSTRAINT fk_purchase_order_line_origin FOREIGN KEY(origin_order_line_id) REFERENCES purchase_order_line(id),
  CONSTRAINT fk_purchase_order_line_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_purchase_order_line_updater FOREIGN KEY(updated_by) REFERENCES users(id),
  CONSTRAINT chk_purchase_order_line_no CHECK(line_no>0),
  CONSTRAINT chk_purchase_order_line_quantity CHECK(planned_quantity BETWEEN 1 AND 99999999),
  CONSTRAINT chk_purchase_order_line_status CHECK(status IN ('draft','open','closed','cancelled')),
  CONSTRAINT chk_purchase_order_line_version CHECK(version>=0),
  CONSTRAINT chk_purchase_order_line_origin CHECK(
    (origin_order_line_id IS NULL AND supplement_evidence IS NULL)
    OR (origin_order_line_id IS NOT NULL AND supplement_evidence IS NOT NULL AND CHAR_LENGTH(TRIM(supplement_evidence))>0)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchase_order_line_source (
  purchase_order_line_id BIGINT UNSIGNED NOT NULL,
  demand_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(purchase_order_line_id,demand_id),
  KEY idx_purchase_order_line_source_demand(demand_id,purchase_order_line_id),
  CONSTRAINT fk_purchase_order_source_line FOREIGN KEY(purchase_order_line_id) REFERENCES purchase_order_line(id),
  CONSTRAINT fk_purchase_order_source_demand FOREIGN KEY(demand_id) REFERENCES production_item_demand(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE purchase_order_line_closure (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_order_line_id BIGINT UNSIGNED NOT NULL,
  reason_type VARCHAR(30) NOT NULL,
  reason TEXT NULL,
  planned_quantity INT NOT NULL,
  received_quantity INT NOT NULL,
  undetermined_quantity INT NOT NULL,
  approved_quantity INT NOT NULL,
  inbound_quantity INT NOT NULL,
  return_due_quantity INT NOT NULL,
  returned_quantity INT NOT NULL,
  quality_returned_quantity INT NOT NULL,
  evidence_json JSON NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  UNIQUE KEY uk_purchase_order_closure_line(purchase_order_line_id),
  CONSTRAINT fk_purchase_order_closure_line FOREIGN KEY(purchase_order_line_id) REFERENCES purchase_order_line(id),
  CONSTRAINT fk_purchase_order_closure_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT chk_purchase_order_closure_reason CHECK(reason_type IN ('quality_target','quality_return_completed','manual_end','cancelled')),
  CONSTRAINT chk_purchase_order_closure_required_reason CHECK(reason_type NOT IN ('manual_end','cancelled') OR (reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason))>0)),
  CONSTRAINT chk_purchase_order_closure_quantities CHECK(
    planned_quantity BETWEEN 1 AND 99999999 AND received_quantity BETWEEN 0 AND 99999999
    AND undetermined_quantity BETWEEN 0 AND 99999999 AND approved_quantity BETWEEN 0 AND 99999999
    AND inbound_quantity BETWEEN 0 AND 99999999 AND return_due_quantity BETWEEN 0 AND 99999999
    AND returned_quantity BETWEEN 0 AND 99999999 AND quality_returned_quantity BETWEEN 0 AND 99999999
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TRIGGER trg_purchase_order_closure_no_update BEFORE UPDATE ON purchase_order_line_closure
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Purchase order closure facts are immutable';
END;
CREATE TRIGGER trg_purchase_order_closure_no_delete BEFORE DELETE ON purchase_order_line_closure
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Purchase order closure facts cannot be deleted';
END;

INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'采购订单','procurement:orders:view','page','/procurement/purchase-orders','GET','/api/procurement/purchase-orders*',250,1
FROM permissions WHERE code='procurement:view';

INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'新增采购订单','procurement:orders:create','button',NULL,'POST','/api/procurement/purchase-orders',251,1
FROM permissions WHERE code='procurement:orders:view';

INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'修改采购草稿','procurement:orders:update','button',NULL,'PATCH','/api/procurement/purchase-orders/:id',252,1
FROM permissions WHERE code='procurement:orders:view';

INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'确认下单','procurement:orders:place','button',NULL,'POST','/api/procurement/purchase-orders/:id/actions/place',253,1
FROM permissions WHERE code='procurement:orders:view';

INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'取消采购单','procurement:orders:cancel','button',NULL,'POST','/api/procurement/purchase-orders/:id/actions/cancel',254,1
FROM permissions WHERE code='procurement:orders:view';

INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'结束采购行','procurement:orders:close','button',NULL,'POST','/api/procurement/purchase-order-lines/:id/actions/close',255,1
FROM permissions WHERE code='procurement:orders:view';

