ALTER TABLE permissions
  ADD CONSTRAINT chk_permissions_type
  CHECK (type IN ('menu', 'page', 'button', 'api'));

ALTER TABLE operation_logs
  ADD CONSTRAINT chk_operation_logs_result
  CHECK (result IN ('success', 'failed'));
