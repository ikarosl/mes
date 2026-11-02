-- One-time 20261102 baseline: phase 2, approval.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

ALTER TABLE `approval_actions`
  ADD CONSTRAINT `fk_approval_actions_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_approval_actions_instance` FOREIGN KEY (`instance_id`) REFERENCES `approval_instances` (`id`),
  ADD CONSTRAINT `fk_approval_actions_instance_step` FOREIGN KEY (`instance_step_id`, `instance_id`) REFERENCES `approval_instance_steps` (`id`, `instance_id`);

ALTER TABLE `approval_flow_definitions`
  ADD CONSTRAINT `fk_approval_flow_definitions_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_approval_flow_definitions_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_approval_flow_definitions_published_version` FOREIGN KEY (`published_version_id`, `id`) REFERENCES `approval_flow_versions` (`id`, `definition_id`),
  ADD CONSTRAINT `fk_approval_flow_definitions_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `approval_flow_steps`
  ADD CONSTRAINT `fk_approval_flow_steps_assignee_user` FOREIGN KEY (`assignee_user_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_approval_flow_steps_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_approval_flow_steps_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_approval_flow_steps_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`),
  ADD CONSTRAINT `fk_approval_flow_steps_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_approval_flow_steps_version` FOREIGN KEY (`flow_version_id`) REFERENCES `approval_flow_versions` (`id`);

ALTER TABLE `approval_flow_versions`
  ADD CONSTRAINT `fk_approval_flow_versions_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_approval_flow_versions_definition` FOREIGN KEY (`definition_id`) REFERENCES `approval_flow_definitions` (`id`),
  ADD CONSTRAINT `fk_approval_flow_versions_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_approval_flow_versions_published_by` FOREIGN KEY (`published_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_approval_flow_versions_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `approval_instance_steps`
  ADD CONSTRAINT `fk_approval_instance_steps_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_approval_instance_steps_flow_step` FOREIGN KEY (`flow_step_id`) REFERENCES `approval_flow_steps` (`id`),
  ADD CONSTRAINT `fk_approval_instance_steps_instance` FOREIGN KEY (`instance_id`) REFERENCES `approval_instances` (`id`),
  ADD CONSTRAINT `fk_approval_instance_steps_resolved_user` FOREIGN KEY (`resolved_assignee_user_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_approval_instance_steps_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `approval_instances`
  ADD CONSTRAINT `fk_approval_instances_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_approval_instances_flow_version` FOREIGN KEY (`flow_version_id`) REFERENCES `approval_flow_versions` (`id`),
  ADD CONSTRAINT `fk_approval_instances_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
