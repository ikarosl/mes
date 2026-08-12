DELETE FROM role_permissions
WHERE permission_id IN (
  SELECT id FROM permissions
  WHERE code IN ('production:steps:manage-abnormal', 'production:rework:execute')
);

DELETE FROM permissions
WHERE code IN ('production:steps:manage-abnormal', 'production:rework:execute');

DROP TABLE rework_records;

ALTER TABLE batch_step_abnormal_dispositions
  DROP INDEX uk_batch_step_abnormal_dispositions_source;
