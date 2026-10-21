-- Pause Approval and Product writes. Continue directly with 202609120001 down.
-- MySQL cannot tighten this FK column while the stored-column table is rebuilt there.
-- Guard before DDL, then tighten it separately so the immutable older down can proceed.
CREATE TEMPORARY TABLE tmp_approval_node_rollback_guard (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_approval_node_rollback_empty CHECK (must_be_zero=0)
) ENGINE=MEMORY;
INSERT INTO tmp_approval_node_rollback_guard (must_be_zero)
SELECT 1 WHERE EXISTS (SELECT 1 FROM approval_instances)
  OR EXISTS (SELECT 1 FROM approval_flow_steps WHERE assignee_type='user');
DROP TEMPORARY TABLE tmp_approval_node_rollback_guard;

ALTER TABLE approval_flow_steps
  DROP FOREIGN KEY fk_approval_flow_steps_role;
ALTER TABLE approval_flow_steps
  MODIFY COLUMN role_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE approval_flow_steps
  ADD CONSTRAINT fk_approval_flow_steps_role FOREIGN KEY (role_id) REFERENCES roles(id);
