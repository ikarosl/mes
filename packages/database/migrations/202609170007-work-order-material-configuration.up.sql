-- Production owns this configuration. Pause Production writes while replacing triggers.
-- Existing choices were immutable: their last editor/time is the original creator/time.
DROP TRIGGER trg_work_order_material_versions_reject_update;
ALTER TABLE work_order_material_versions
  ADD COLUMN updated_by BIGINT UNSIGNED NULL,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD COLUMN version INT NOT NULL DEFAULT 0;
UPDATE work_order_material_versions SET updated_by=created_by,updated_at=created_at;
ALTER TABLE work_order_material_versions
  MODIFY COLUMN updated_by BIGINT UNSIGNED NOT NULL,
  ADD CONSTRAINT fk_work_order_material_versions_updater FOREIGN KEY (updated_by) REFERENCES users(id),
  ADD CONSTRAINT chk_work_order_material_versions_version CHECK (version >= 0);

CREATE TRIGGER trg_work_order_material_versions_guard_insert
BEFORE INSERT ON work_order_material_versions
FOR EACH ROW
BEGIN
  DECLARE order_kind VARCHAR(30);
  DECLARE order_status VARCHAR(30);
  DECLARE in_use BOOLEAN DEFAULT FALSE;
  SELECT order_type,status INTO order_kind,order_status
    FROM work_orders WHERE id=NEW.work_order_id FOR UPDATE;
  IF order_kind <> 'mass_production' OR order_status NOT IN ('released','doing') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material configuration requires an open mass production order';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM production_batches b JOIN production_item_demand d ON d.production_batch_id=b.id
    WHERE b.work_order_id=NEW.work_order_id AND b.status NOT IN ('cancelled','terminated')
    LIMIT 1 FOR SHARE
  ) INTO in_use;
  IF in_use THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'work order material configuration is referenced by a production task';
  END IF;
END;

CREATE TRIGGER trg_work_order_material_versions_guard_update
BEFORE UPDATE ON work_order_material_versions
FOR EACH ROW
BEGIN
  DECLARE order_kind VARCHAR(30);
  DECLARE order_status VARCHAR(30);
  DECLARE in_use BOOLEAN DEFAULT FALSE;
  SELECT order_type,status INTO order_kind,order_status
    FROM work_orders WHERE id=NEW.work_order_id FOR UPDATE;
  IF order_kind <> 'mass_production' OR order_status NOT IN ('released','doing') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material configuration requires an open mass production order';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM production_batches b JOIN production_item_demand d ON d.production_batch_id=b.id
    WHERE b.work_order_id=NEW.work_order_id AND b.status NOT IN ('cancelled','terminated')
    LIMIT 1 FOR SHARE
  ) INTO in_use;
  IF in_use THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'work order material configuration is referenced by a production task';
  END IF;
  IF NEW.work_order_id <> OLD.work_order_id OR NEW.material_id <> OLD.material_id
    OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material configuration identity and creation audit cannot change';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'material configuration update must advance its version';
  END IF;
END;
-- The existing delete-rejection trigger remains: BOM identities do not change here.
