UPDATE production_material_supplement
SET status = 'approved'
WHERE status = 'activated';

ALTER TABLE production_material_supplement
  DROP FOREIGN KEY fk_production_material_supplement_activated_by,
  DROP CHECK chk_production_material_supplement_status,
  DROP INDEX idx_production_material_supplement_activation,
  DROP COLUMN activated_by,
  DROP COLUMN activated_at,
  ADD CONSTRAINT chk_production_material_supplement_status CHECK (status = 'approved');
