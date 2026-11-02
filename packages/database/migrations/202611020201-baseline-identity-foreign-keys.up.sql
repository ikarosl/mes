-- One-time 20261102 baseline: phase 2, identity.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

ALTER TABLE `departments`
  ADD CONSTRAINT `fk_departments_parent` FOREIGN KEY (`parent_id`) REFERENCES `departments` (`id`);

ALTER TABLE `permissions`
  ADD CONSTRAINT `fk_permissions_parent` FOREIGN KEY (`parent_id`) REFERENCES `permissions` (`id`);

ALTER TABLE `refresh_tokens`
  ADD CONSTRAINT `fk_refresh_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

ALTER TABLE `role_permissions`
  ADD CONSTRAINT `fk_role_permissions_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE;

ALTER TABLE `user_candidate_config_roles`
  ADD CONSTRAINT `fk_user_candidate_config_roles_config` FOREIGN KEY (`config_id`) REFERENCES `user_candidate_configs` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_user_candidate_config_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`);

ALTER TABLE `user_candidate_configs`
  ADD CONSTRAINT `fk_user_candidate_configs_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_user_candidate_configs_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_user_candidate_configs_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `user_roles`
  ADD CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

ALTER TABLE `users`
  ADD CONSTRAINT `fk_users_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`);
