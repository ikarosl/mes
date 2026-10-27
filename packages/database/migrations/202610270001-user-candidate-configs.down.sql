-- A configured scene is an intentional administrator decision, including an empty role set.
-- Refuse to discard that decision during a schema rollback.
CREATE TEMPORARY TABLE tmp_user_candidate_config_rollback_guard (
  must_be_zero TINYINT NOT NULL,
  CONSTRAINT chk_user_candidate_config_rollback_guard CHECK (must_be_zero=0)
) ENGINE=MEMORY;

INSERT INTO tmp_user_candidate_config_rollback_guard (must_be_zero)
SELECT 1 FROM user_candidate_configs LIMIT 1;

DROP TEMPORARY TABLE tmp_user_candidate_config_rollback_guard;

START TRANSACTION;

DELETE rp FROM role_permissions rp
JOIN permissions p ON p.id=rp.permission_id
WHERE p.code IN ('system:user-candidates:view','system:user-candidates:configure');

DELETE FROM permissions WHERE code='system:user-candidates:configure';
DELETE FROM permissions WHERE code='system:user-candidates:view';

COMMIT;

DROP TABLE user_candidate_config_roles;
DROP TABLE user_candidate_configs;
