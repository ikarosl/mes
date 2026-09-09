CREATE TEMPORARY TABLE tmp_order_material_policy_down_guard (
  invalid_value TINYINT NOT NULL,
  CHECK (invalid_value = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_order_material_policy_down_guard (invalid_value)
SELECT 1 WHERE EXISTS (SELECT 1 FROM work_orders) OR EXISTS (SELECT 1 FROM work_order_material_versions);

DROP TEMPORARY TABLE tmp_order_material_policy_down_guard;

DROP TRIGGER trg_work_orders_reject_released_type_update;
DROP TRIGGER trg_work_order_material_versions_reject_delete;
DROP TRIGGER trg_work_order_material_versions_reject_update;
DROP TABLE work_order_material_versions;
ALTER TABLE work_orders DROP CHECK chk_work_orders_type, DROP COLUMN order_type;
