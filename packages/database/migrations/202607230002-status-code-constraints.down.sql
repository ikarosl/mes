ALTER TABLE operation_logs
  DROP CHECK chk_operation_logs_result;

ALTER TABLE permissions
  DROP CHECK chk_permissions_type;
