-- One-time 20261102 baseline: phase 2, template.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

ALTER TABLE `business_templates`
  ADD CONSTRAINT `fk_business_templates_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_business_templates_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_business_templates_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
