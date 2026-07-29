UPDATE permissions
SET parent_id = NULL
WHERE code LIKE 'system:%'
  AND code <> 'system:view';

DELETE FROM permissions WHERE code = 'system:view';
