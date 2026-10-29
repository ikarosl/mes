-- Demo configuration only; production initialization leaves candidate scenes unconfigured.
-- Keep an existing scene configuration, including an intentionally empty or deleted one.
SET @demo_candidate_actor_id = (SELECT id FROM users WHERE username = 'admin' AND deleted_at IS NULL LIMIT 1);
SET @demo_candidate_existing_config_id = (
  SELECT id FROM user_candidate_configs WHERE scene_code = 'production.work_order_owner'
);

INSERT INTO user_candidate_configs (scene_code, version, created_by, updated_by)
SELECT 'production.work_order_owner', 1, @demo_candidate_actor_id, @demo_candidate_actor_id
WHERE @demo_candidate_existing_config_id IS NULL;

INSERT INTO user_candidate_config_roles (config_id, role_id)
SELECT c.id, r.id
FROM user_candidate_configs c
JOIN roles r ON r.code = 'production' AND r.status = 1 AND r.deleted_at IS NULL
WHERE c.scene_code = 'production.work_order_owner'
  AND @demo_candidate_existing_config_id IS NULL;
