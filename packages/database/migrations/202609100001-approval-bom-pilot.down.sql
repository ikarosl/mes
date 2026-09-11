-- Rollback only on an empty approval history; never discard decisions implicitly.
CREATE TEMPORARY TABLE tmp_approval_rollback_guard (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_approval_rollback_guard CHECK (must_be_zero=0)
) ENGINE=MEMORY;
INSERT INTO tmp_approval_rollback_guard SELECT 1 FROM approval_instances LIMIT 1;
DROP TEMPORARY TABLE tmp_approval_rollback_guard;

DELETE rp
FROM role_permissions rp
JOIN permissions p ON p.id=rp.permission_id
WHERE p.code IN ('approval:view','approval:configure','approval:decide','approval:reassign');

DELETE FROM permissions WHERE code IN ('approval:configure','approval:decide','approval:reassign');
DELETE FROM permissions WHERE code='approval:view';

ALTER TABLE products
  DROP FOREIGN KEY fk_products_bom_approval_instance,
  DROP CHECK chk_products_bom_status,
  DROP CHECK chk_products_version,
  DROP INDEX idx_products_bom_approval_instance,
  DROP COLUMN bom_approval_instance_id,
  DROP COLUMN bom_status,
  DROP COLUMN version;

ALTER TABLE approval_flow_definitions
  DROP FOREIGN KEY fk_approval_flow_definitions_published_version;

DROP TABLE approval_actions;
DROP TABLE approval_tasks;
DROP TABLE approval_instance_steps;
DROP TABLE approval_instances;
DROP TABLE approval_flow_steps;
DROP TABLE approval_flow_versions;
DROP TABLE approval_flow_definitions;
