-- Restoring permanent immutability cannot discard edited configuration history.
-- Development may reset configuration/business data before rolling back.
CREATE TEMPORARY TABLE tmp_work_order_configuration_down_guard (
  invalid_value TINYINT NOT NULL,
  CHECK (invalid_value = 0)
) ENGINE=MEMORY;
INSERT INTO tmp_work_order_configuration_down_guard (invalid_value)
SELECT 1 WHERE EXISTS (SELECT 1 FROM work_order_material_versions);
DROP TEMPORARY TABLE tmp_work_order_configuration_down_guard;

DROP TRIGGER trg_work_order_material_versions_guard_update;
DROP TRIGGER trg_work_order_material_versions_guard_insert;
ALTER TABLE work_order_material_versions
  DROP FOREIGN KEY fk_work_order_material_versions_updater,
  DROP CHECK chk_work_order_material_versions_version,
  DROP COLUMN updated_by,
  DROP COLUMN updated_at,
  DROP COLUMN version;
CREATE TRIGGER trg_work_order_material_versions_reject_update
BEFORE UPDATE ON work_order_material_versions
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'mass production material choice is immutable';
END;
