-- Old purchased inbounds lack truthful procurement and inspection provenance. Reset development data first.
CREATE TEMPORARY TABLE tmp_procurement_cutover_guard (invalid_value TINYINT NOT NULL CHECK(invalid_value=0)) ENGINE=MEMORY;
INSERT INTO tmp_procurement_cutover_guard SELECT 1 WHERE EXISTS(SELECT 1 FROM inbound_order WHERE source_type='purchased');
DROP TEMPORARY TABLE tmp_procurement_cutover_guard;

CREATE TABLE procurement_receipt (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_no VARCHAR(100) NOT NULL,
  purchase_order_id BIGINT UNSIGNED NOT NULL,
  received_at DATETIME NOT NULL,
  handover_evidence TEXT NOT NULL,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  UNIQUE KEY uk_procurement_receipt_no(receipt_no),
  UNIQUE KEY uk_procurement_receipt_order(id,purchase_order_id),
  KEY idx_procurement_receipt_order(purchase_order_id,received_at,id),
  CONSTRAINT fk_procurement_receipt_order FOREIGN KEY(purchase_order_id) REFERENCES purchase_order(id),
  CONSTRAINT fk_procurement_receipt_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT chk_procurement_receipt_evidence CHECK(CHAR_LENGTH(TRIM(handover_evidence))>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE procurement_receipt_line (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_id BIGINT UNSIGNED NOT NULL,
  purchase_order_id BIGINT UNSIGNED NOT NULL,
  purchase_order_line_id BIGINT UNSIGNED NOT NULL,
  line_no INT NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  material_variant_id BIGINT UNSIGNED NOT NULL,
  supplier_batch_code VARCHAR(100) NULL,
  current_receipt_revision_id BIGINT UNSIGNED NULL,
  batch_id BIGINT UNSIGNED NULL,
  over_receipt_note TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY(id),
  UNIQUE KEY uk_procurement_receipt_line_no(receipt_id,line_no),
  UNIQUE KEY uk_procurement_receipt_line_material(id,item_id,material_variant_id),
  UNIQUE KEY uk_procurement_receipt_line_order(id,purchase_order_line_id),
  UNIQUE KEY uk_procurement_receipt_line_batch(batch_id),
  KEY idx_procurement_receipt_line_order(purchase_order_line_id,id),
  CONSTRAINT fk_procurement_receipt_line_receipt FOREIGN KEY(receipt_id,purchase_order_id) REFERENCES procurement_receipt(id,purchase_order_id),
  CONSTRAINT fk_procurement_receipt_line_order FOREIGN KEY(purchase_order_line_id,purchase_order_id) REFERENCES purchase_order_line(id,purchase_order_id),
  CONSTRAINT fk_procurement_receipt_line_material FOREIGN KEY(purchase_order_line_id,item_id,material_variant_id) REFERENCES purchase_order_line(id,item_id,material_variant_id),
  CONSTRAINT fk_procurement_receipt_line_batch FOREIGN KEY(batch_id,item_id,material_variant_id) REFERENCES item_batch(id,item_id,material_variant_id),
  CONSTRAINT fk_procurement_receipt_line_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_procurement_receipt_line_updater FOREIGN KEY(updated_by) REFERENCES users(id),
  CONSTRAINT chk_procurement_receipt_line_number CHECK(line_no>0),
  CONSTRAINT chk_procurement_receipt_line_version CHECK(version>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE procurement_receipt_revision (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_line_id BIGINT UNSIGNED NOT NULL,
  revision_no INT NOT NULL,
  previous_revision_id BIGINT UNSIGNED NULL,
  received_quantity INT NOT NULL,
  reason TEXT NOT NULL,
  physical_identity_confirmed TINYINT NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  UNIQUE KEY uk_procurement_receipt_revision_no(receipt_line_id,revision_no),
  UNIQUE KEY uk_procurement_receipt_revision_line(id,receipt_line_id),
  CONSTRAINT fk_procurement_revision_line FOREIGN KEY(receipt_line_id) REFERENCES procurement_receipt_line(id),
  CONSTRAINT fk_procurement_revision_previous FOREIGN KEY(previous_revision_id,receipt_line_id) REFERENCES procurement_receipt_revision(id,receipt_line_id),
  CONSTRAINT fk_procurement_revision_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT chk_procurement_revision_no CHECK(revision_no>0),
  CONSTRAINT chk_procurement_revision_quantity CHECK(received_quantity BETWEEN 0 AND 99999999),
  CONSTRAINT chk_procurement_revision_identity CHECK(physical_identity_confirmed=1),
  CONSTRAINT chk_procurement_revision_reason CHECK(CHAR_LENGTH(TRIM(reason))>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE procurement_receipt_line ADD CONSTRAINT fk_procurement_receipt_current_revision
  FOREIGN KEY(current_receipt_revision_id,id) REFERENCES procurement_receipt_revision(id,receipt_line_id);

CREATE TABLE procurement_receipt_scope (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_line_id BIGINT UNSIGNED NOT NULL,
  receipt_revision_id BIGINT UNSIGNED NOT NULL,
  parent_scope_id BIGINT UNSIGNED NULL,
  quantity INT NOT NULL,
  disposition VARCHAR(30) NOT NULL,
  transition_type VARCHAR(30) NOT NULL,
  inspection_id BIGINT UNSIGNED NULL,
  review_case_id BIGINT UNSIGNED NULL,
  termination_root_scope_id BIGINT UNSIGNED NULL,
  termination_reason TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY(id),
  UNIQUE KEY uk_procurement_scope_line(id,receipt_line_id),
  KEY idx_procurement_scope_disposition(receipt_line_id,disposition,id),
  KEY idx_procurement_scope_case(review_case_id,id),
  KEY idx_procurement_scope_inspection(inspection_id,id),
  CONSTRAINT fk_procurement_scope_line FOREIGN KEY(receipt_line_id) REFERENCES procurement_receipt_line(id),
  CONSTRAINT fk_procurement_scope_revision FOREIGN KEY(receipt_revision_id,receipt_line_id) REFERENCES procurement_receipt_revision(id,receipt_line_id),
  CONSTRAINT fk_procurement_scope_parent FOREIGN KEY(parent_scope_id,receipt_line_id) REFERENCES procurement_receipt_scope(id,receipt_line_id),
  CONSTRAINT fk_procurement_scope_termination FOREIGN KEY(termination_root_scope_id,receipt_line_id) REFERENCES procurement_receipt_scope(id,receipt_line_id),
  CONSTRAINT fk_procurement_scope_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_procurement_scope_updater FOREIGN KEY(updated_by) REFERENCES users(id),
  CONSTRAINT chk_procurement_scope_quantity CHECK(quantity BETWEEN 1 AND 99999999),
  CONSTRAINT chk_procurement_scope_version CHECK(version>=0),
  CONSTRAINT chk_procurement_scope_disposition CHECK(disposition IN ('uninspected','reviewing','approved','quality_return','termination_return','inbounded','returned','superseded')),
  CONSTRAINT chk_procurement_scope_transition CHECK(transition_type IN ('receipt','split','inspection','review','receipt_correction','termination','inbound','return')),
  CONSTRAINT chk_procurement_scope_terminal_reason CHECK(
    (termination_root_scope_id IS NULL AND termination_reason IS NULL)
    OR (termination_root_scope_id IS NOT NULL AND termination_reason IS NOT NULL AND CHAR_LENGTH(TRIM(termination_reason))>0)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE quality_inbound_case (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_line_id BIGINT UNSIGNED NOT NULL,
  receipt_revision_id BIGINT UNSIGNED NOT NULL,
  source_scope_id BIGINT UNSIGNED NULL,
  target_scope_id BIGINT UNSIGNED NULL,
  case_type VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'reviewing',
  covered_quantity INT NOT NULL,
  reason TEXT NOT NULL,
  completed_by BIGINT UNSIGNED NULL,
  completed_at DATETIME NULL,
  superseded_by_receipt_revision_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  version INT NOT NULL DEFAULT 0,
  PRIMARY KEY(id),
  UNIQUE KEY uk_quality_inbound_case_line(id,receipt_line_id),
  UNIQUE KEY uk_quality_inbound_case_target(target_scope_id),
  KEY idx_quality_inbound_case_status(status,created_at,id),
  KEY idx_quality_inbound_case_line(receipt_line_id,id),
  CONSTRAINT fk_quality_inbound_case_line FOREIGN KEY(receipt_line_id) REFERENCES procurement_receipt_line(id),
  CONSTRAINT fk_quality_inbound_case_revision FOREIGN KEY(receipt_revision_id,receipt_line_id) REFERENCES procurement_receipt_revision(id,receipt_line_id),
  CONSTRAINT fk_quality_inbound_case_source FOREIGN KEY(source_scope_id,receipt_line_id) REFERENCES procurement_receipt_scope(id,receipt_line_id),
  CONSTRAINT fk_quality_inbound_case_target FOREIGN KEY(target_scope_id,receipt_line_id) REFERENCES procurement_receipt_scope(id,receipt_line_id),
  CONSTRAINT fk_quality_inbound_case_superseded FOREIGN KEY(superseded_by_receipt_revision_id,receipt_line_id) REFERENCES procurement_receipt_revision(id,receipt_line_id),
  CONSTRAINT fk_quality_inbound_case_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_quality_inbound_case_updater FOREIGN KEY(updated_by) REFERENCES users(id),
  CONSTRAINT fk_quality_inbound_case_completer FOREIGN KEY(completed_by) REFERENCES users(id),
  CONSTRAINT chk_quality_inbound_case_type CHECK(case_type IN ('initial','reinspection','inspection_correction','receipt_correction')),
  CONSTRAINT chk_quality_inbound_case_status CHECK(status IN ('reviewing','completed','superseded')),
  CONSTRAINT chk_quality_inbound_case_version CHECK(version>=0),
  CONSTRAINT chk_quality_inbound_case_reason CHECK(CHAR_LENGTH(TRIM(reason))>0),
  CONSTRAINT chk_quality_inbound_case_quantity CHECK(covered_quantity BETWEEN 0 AND 99999999),
  CONSTRAINT chk_quality_inbound_case_scope CHECK(
    ((covered_quantity=0 AND case_type='receipt_correction' AND target_scope_id IS NULL)
      OR (covered_quantity>0 AND target_scope_id IS NOT NULL))
    AND (source_scope_id IS NOT NULL OR case_type='receipt_correction')
  ),
  CONSTRAINT chk_quality_inbound_case_metadata CHECK(
    (status='reviewing' AND completed_by IS NULL AND completed_at IS NULL AND superseded_by_receipt_revision_id IS NULL)
    OR (status='completed' AND completed_by IS NOT NULL AND completed_at IS NOT NULL AND superseded_by_receipt_revision_id IS NULL)
    OR (status='superseded' AND completed_by IS NULL AND completed_at IS NULL AND superseded_by_receipt_revision_id IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE quality_inbound_inspection (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id BIGINT UNSIGNED NOT NULL,
  receipt_line_id BIGINT UNSIGNED NOT NULL,
  receipt_revision_id BIGINT UNSIGNED NOT NULL,
  covered_quantity INT NOT NULL,
  inspection_method VARCHAR(30) NOT NULL,
  qualified_quantity INT NULL,
  unqualified_quantity INT NULL,
  sample_quantity INT NULL,
  sample_unqualified_quantity INT NULL,
  removed_defect_quantity INT NOT NULL,
  inbound_approved TINYINT NOT NULL,
  disposition VARCHAR(30) NOT NULL,
  approved_quantity INT NOT NULL,
  quality_return_quantity INT NOT NULL,
  undetermined_quantity INT NOT NULL,
  remark TEXT NOT NULL,
  evidence TEXT NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  UNIQUE KEY uk_quality_inbound_inspection_case(case_id),
  UNIQUE KEY uk_quality_inbound_inspection_line(id,receipt_line_id),
  KEY idx_quality_inbound_inspection_line(receipt_line_id,created_at,id),
  CONSTRAINT fk_quality_inbound_inspection_case FOREIGN KEY(case_id,receipt_line_id) REFERENCES quality_inbound_case(id,receipt_line_id),
  CONSTRAINT fk_quality_inbound_inspection_revision FOREIGN KEY(receipt_revision_id,receipt_line_id) REFERENCES procurement_receipt_revision(id,receipt_line_id),
  CONSTRAINT fk_quality_inbound_inspection_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT chk_quality_inbound_inspection_quantities CHECK(
    covered_quantity BETWEEN 0 AND 99999999
    AND (qualified_quantity IS NULL OR qualified_quantity BETWEEN 0 AND 99999999)
    AND (unqualified_quantity IS NULL OR unqualified_quantity BETWEEN 0 AND 99999999)
    AND (sample_quantity IS NULL OR sample_quantity BETWEEN 1 AND 99999999)
    AND (sample_unqualified_quantity IS NULL OR sample_unqualified_quantity BETWEEN 0 AND 99999999)
    AND removed_defect_quantity BETWEEN 0 AND covered_quantity
    AND approved_quantity BETWEEN 0 AND covered_quantity
    AND quality_return_quantity BETWEEN 0 AND covered_quantity
    AND undetermined_quantity BETWEEN 0 AND covered_quantity
    AND approved_quantity+quality_return_quantity+undetermined_quantity=covered_quantity
  ),
  CONSTRAINT chk_quality_inbound_inspection_boolean CHECK(inbound_approved IN(0,1)),
  CONSTRAINT chk_quality_inbound_inspection_method CHECK(inspection_method IN('full','sampling','review_only')),
  CONSTRAINT chk_quality_inbound_inspection_disposition CHECK(disposition IN('release','await_full_inspection','await_decision','return_all','receipt_zero_confirmed')),
  CONSTRAINT chk_quality_inbound_inspection_evidence CHECK(CHAR_LENGTH(TRIM(remark))>0 AND CHAR_LENGTH(TRIM(evidence))>0),
  CONSTRAINT chk_quality_inbound_inspection_measurements CHECK(
    (inspection_method='full' AND covered_quantity>0 AND qualified_quantity IS NOT NULL AND unqualified_quantity IS NOT NULL
      AND qualified_quantity+unqualified_quantity=covered_quantity AND removed_defect_quantity<=unqualified_quantity
      AND sample_quantity IS NULL AND sample_unqualified_quantity IS NULL)
    OR (inspection_method='sampling' AND covered_quantity>0 AND qualified_quantity IS NULL AND unqualified_quantity IS NULL
      AND sample_quantity IS NOT NULL AND sample_unqualified_quantity IS NOT NULL
      AND sample_quantity BETWEEN 1 AND covered_quantity AND sample_unqualified_quantity BETWEEN 0 AND sample_quantity)
    OR (inspection_method='review_only' AND covered_quantity=0 AND qualified_quantity IS NULL AND unqualified_quantity IS NULL
      AND sample_quantity IS NULL AND sample_unqualified_quantity IS NULL AND disposition='receipt_zero_confirmed')
  ),
  CONSTRAINT chk_quality_inbound_inspection_result CHECK(
    (disposition='release' AND covered_quantity>0 AND inbound_approved=1
      AND approved_quantity=covered_quantity-removed_defect_quantity AND quality_return_quantity=removed_defect_quantity AND undetermined_quantity=0
      AND ((inspection_method='full' AND removed_defect_quantity=unqualified_quantity)
        OR (inspection_method='sampling' AND removed_defect_quantity>=sample_unqualified_quantity)))
    OR (disposition='return_all' AND covered_quantity>0 AND inbound_approved=0 AND approved_quantity=0 AND quality_return_quantity=covered_quantity AND undetermined_quantity=0)
    OR (disposition IN('await_full_inspection','await_decision') AND covered_quantity>0 AND inbound_approved=0 AND approved_quantity=0
      AND quality_return_quantity=removed_defect_quantity AND undetermined_quantity=covered_quantity-removed_defect_quantity)
    OR (disposition='receipt_zero_confirmed' AND covered_quantity=0 AND inspection_method='review_only' AND inbound_approved=0)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TRIGGER trg_quality_inbound_inspection_no_update BEFORE UPDATE ON quality_inbound_inspection
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound inspection facts are immutable';
END;
CREATE TRIGGER trg_quality_inbound_inspection_no_delete BEFORE DELETE ON quality_inbound_inspection
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Inbound inspection facts cannot be deleted';
END;

ALTER TABLE procurement_receipt_scope
  ADD CONSTRAINT fk_procurement_scope_inspection FOREIGN KEY(inspection_id,receipt_line_id) REFERENCES quality_inbound_inspection(id,receipt_line_id),
  ADD CONSTRAINT fk_procurement_scope_case FOREIGN KEY(review_case_id,receipt_line_id) REFERENCES quality_inbound_case(id,receipt_line_id);

CREATE TABLE procurement_supplier_return (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  return_no VARCHAR(100) NOT NULL,
  receipt_line_id BIGINT UNSIGNED NOT NULL,
  receipt_revision_id BIGINT UNSIGNED NOT NULL,
  scope_id BIGINT UNSIGNED NOT NULL,
  inspection_id BIGINT UNSIGNED NULL,
  reason_type VARCHAR(30) NOT NULL,
  returned_quantity INT NOT NULL,
  returned_at DATETIME NOT NULL,
  handover_evidence TEXT NOT NULL,
  remark TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  UNIQUE KEY uk_procurement_supplier_return_no(return_no),
  UNIQUE KEY uk_procurement_supplier_return_scope(scope_id),
  UNIQUE KEY uk_procurement_supplier_return_line(id,receipt_line_id),
  KEY idx_procurement_supplier_return_line(receipt_line_id,returned_at,id),
  CONSTRAINT fk_procurement_return_revision FOREIGN KEY(receipt_revision_id,receipt_line_id) REFERENCES procurement_receipt_revision(id,receipt_line_id),
  CONSTRAINT fk_procurement_return_scope FOREIGN KEY(scope_id,receipt_line_id) REFERENCES procurement_receipt_scope(id,receipt_line_id),
  CONSTRAINT fk_procurement_return_inspection FOREIGN KEY(inspection_id,receipt_line_id) REFERENCES quality_inbound_inspection(id,receipt_line_id),
  CONSTRAINT fk_procurement_return_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT chk_procurement_return_reason CHECK(reason_type IN ('quality','procurement_termination')),
  CONSTRAINT chk_procurement_return_inspection CHECK(reason_type<>'quality' OR inspection_id IS NOT NULL),
  CONSTRAINT chk_procurement_return_quantity CHECK(returned_quantity BETWEEN 1 AND 99999999),
  CONSTRAINT chk_procurement_return_evidence CHECK(CHAR_LENGTH(TRIM(handover_evidence))>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE purchase_order_line
  ADD COLUMN origin_receipt_line_id BIGINT UNSIGNED NULL AFTER origin_order_line_id,
  ADD COLUMN origin_supplier_return_id BIGINT UNSIGNED NULL AFTER origin_receipt_line_id,
  ADD CONSTRAINT fk_purchase_order_line_origin_receipt FOREIGN KEY(origin_receipt_line_id,origin_order_line_id) REFERENCES procurement_receipt_line(id,purchase_order_line_id),
  ADD CONSTRAINT fk_purchase_order_line_origin_return FOREIGN KEY(origin_supplier_return_id,origin_receipt_line_id) REFERENCES procurement_supplier_return(id,receipt_line_id),
  ADD CONSTRAINT chk_purchase_order_line_return_source CHECK(origin_supplier_return_id IS NULL OR origin_receipt_line_id IS NOT NULL);

ALTER TABLE inbound_detail
  DROP INDEX uk_inbound_detail_order_batch_item,
  ADD COLUMN procurement_receipt_line_id BIGINT UNSIGNED NULL,
  ADD COLUMN procurement_receipt_revision_id BIGINT UNSIGNED NULL,
  ADD COLUMN procurement_scope_id BIGINT UNSIGNED NULL,
  ADD COLUMN procurement_inspection_id BIGINT UNSIGNED NULL,
  ADD UNIQUE KEY uk_inbound_detail_procurement_scope(procurement_scope_id),
  ADD KEY idx_inbound_detail_procurement_receipt(procurement_receipt_line_id,id),
  ADD KEY idx_inbound_detail_procurement_inspection(procurement_inspection_id,id),
  ADD CONSTRAINT fk_inbound_detail_procurement_revision FOREIGN KEY(procurement_receipt_revision_id,procurement_receipt_line_id) REFERENCES procurement_receipt_revision(id,receipt_line_id),
  ADD CONSTRAINT fk_inbound_detail_procurement_scope FOREIGN KEY(procurement_scope_id,procurement_receipt_line_id) REFERENCES procurement_receipt_scope(id,receipt_line_id),
  ADD CONSTRAINT fk_inbound_detail_procurement_inspection FOREIGN KEY(procurement_inspection_id,procurement_receipt_line_id) REFERENCES quality_inbound_inspection(id,receipt_line_id),
  ADD CONSTRAINT fk_inbound_detail_procurement_material FOREIGN KEY(procurement_receipt_line_id,item_id,material_variant_id) REFERENCES procurement_receipt_line(id,item_id,material_variant_id),
  ADD CONSTRAINT chk_inbound_detail_procurement_source CHECK(
    (procurement_receipt_line_id IS NULL AND procurement_receipt_revision_id IS NULL AND procurement_scope_id IS NULL AND procurement_inspection_id IS NULL)
    OR (product_id IS NULL AND procurement_receipt_line_id IS NOT NULL AND procurement_receipt_revision_id IS NOT NULL AND procurement_scope_id IS NOT NULL AND procurement_inspection_id IS NOT NULL)
  );

CREATE TRIGGER trg_procurement_receipt_no_update BEFORE UPDATE ON procurement_receipt
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Procurement receipt facts are immutable';
END;

CREATE TRIGGER trg_procurement_receipt_no_delete BEFORE DELETE ON procurement_receipt
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Procurement receipt facts are immutable';
END;

CREATE TRIGGER trg_procurement_receipt_revision_no_update BEFORE UPDATE ON procurement_receipt_revision
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Procurement receipt facts are immutable';
END;

CREATE TRIGGER trg_procurement_receipt_revision_no_delete BEFORE DELETE ON procurement_receipt_revision
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Procurement receipt facts are immutable';
END;

CREATE TRIGGER trg_procurement_supplier_return_no_update BEFORE UPDATE ON procurement_supplier_return
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Procurement receipt facts are immutable';
END;

CREATE TRIGGER trg_procurement_supplier_return_no_delete BEFORE DELETE ON procurement_supplier_return
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Procurement receipt facts are immutable';
END;

CREATE TRIGGER trg_procurement_receipt_batch_bind BEFORE UPDATE ON procurement_receipt_line
FOR EACH ROW
BEGIN
  IF NOT (NEW.receipt_id <=> OLD.receipt_id) OR NOT (NEW.purchase_order_id <=> OLD.purchase_order_id)
    OR NOT (NEW.purchase_order_line_id <=> OLD.purchase_order_line_id) OR NOT (NEW.item_id <=> OLD.item_id)
    OR NOT (NEW.material_variant_id <=> OLD.material_variant_id) OR NOT (NEW.supplier_batch_code <=> OLD.supplier_batch_code)
    OR (OLD.batch_id IS NOT NULL AND NOT (NEW.batch_id <=> OLD.batch_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt identity and its bound inventory batch cannot change';
  END IF;
END;

INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'到货管理','procurement:receipts:view','page','/procurement/receipts','GET','/api/procurement/receipts*',260,1 FROM permissions WHERE code='procurement:view';
INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'确认到货','procurement:receipts:confirm','button',NULL,'POST','/api/procurement/receipt*',261,1 FROM permissions WHERE code='procurement:receipts:view';
INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'实收更正','procurement:receipts:correct','button',NULL,'POST','/api/procurement/receipt*',262,1 FROM permissions WHERE code='procurement:receipts:view';
INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'退回供应商','procurement:receipts:return','button',NULL,'POST','/api/procurement/receipt*',263,1 FROM permissions WHERE code='procurement:receipts:view';
INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
VALUES(NULL,'来料质检','quality:inbound-inspections:view','page','/quality/inbound-inspections','GET','/api/quality/inbound-inspections*',270,1);
INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'发起来料复核','quality:inbound-inspections:review','button',NULL,'POST','/api/procurement/receipt-lines/*',271,1 FROM permissions WHERE code='quality:inbound-inspections:view';
INSERT INTO permissions(parent_id,name,code,type,route_path,api_method,api_path,sort_order,status)
SELECT id,'完成来料检验','quality:inbound-inspections:inspect','button',NULL,'POST','/api/procurement/receipt-lines/*',272,1 FROM permissions WHERE code='quality:inbound-inspections:view';

