-- Keep the shared role/user schema nullable, including recovery after rollback preparation.
-- The paired down prepares the immutable 202609120001 down; roll both versions back together.
ALTER TABLE approval_flow_steps
  MODIFY COLUMN role_id BIGINT UNSIGNED NULL;
