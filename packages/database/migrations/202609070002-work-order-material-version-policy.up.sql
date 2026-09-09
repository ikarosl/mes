-- Production owns the order type and the immutable mass-production version choice.
CREATE TEMPORARY TABLE tmp_order_material_policy_up_guard (
  invalid_value TINYINT NOT NULL,
  CHECK (invalid_value = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_order_material_policy_up_guard (invalid_value)
SELECT 1 WHERE EXISTS (SELECT 1 FROM work_orders);

DROP TEMPORARY TABLE tmp_order_material_policy_up_guard;

ALTER TABLE work_orders
  ADD COLUMN order_type VARCHAR(30) NOT NULL AFTER work_order_no,
  ADD CONSTRAINT chk_work_orders_type CHECK (order_type IN ('mass_production', 'research'));

CREATE TABLE work_order_material_versions (
  work_order_id BIGINT UNSIGNED NOT NULL,
  material_id BIGINT UNSIGNED NOT NULL,
  material_variant_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (work_order_id, material_id),
  CONSTRAINT fk_work_order_material_versions_order FOREIGN KEY (work_order_id) REFERENCES work_orders(id),
  CONSTRAINT fk_work_order_material_versions_variant FOREIGN KEY (material_variant_id, material_id)
    REFERENCES material_variants(id, material_id),
  CONSTRAINT fk_work_order_material_versions_actor FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- This is a configuration decision, not a demand or an inventory quantity.
-- The application inserts the first choice with its demand and audit in one
-- transaction, locking work_orders first; all demand writers validate that choice.
CREATE TRIGGER trg_work_order_material_versions_reject_update
BEFORE UPDATE ON work_order_material_versions
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'mass production material choice is immutable';
END;

CREATE TRIGGER trg_work_order_material_versions_reject_delete
BEFORE DELETE ON work_order_material_versions
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'mass production material choice is immutable';
END;

CREATE TRIGGER trg_work_orders_reject_released_type_update
BEFORE UPDATE ON work_orders
FOR EACH ROW
BEGIN
  IF NOT (NEW.order_type <=> OLD.order_type) AND OLD.status <> 'draft' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'released work order type is immutable';
  END IF;
END;
