-- One-time 20261102 baseline: phase 2, product.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

ALTER TABLE `item_categories`
  ADD CONSTRAINT `fk_item_categories_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_item_categories_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_item_categories_parent` FOREIGN KEY (`parent_id`) REFERENCES `item_categories` (`id`),
  ADD CONSTRAINT `fk_item_categories_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `material_variants`
  ADD CONSTRAINT `fk_material_variants_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_material_variants_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_material_variants_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`),
  ADD CONSTRAINT `fk_material_variants_specification_file` FOREIGN KEY (`specification_file_id`) REFERENCES `technical_files` (`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `fk_material_variants_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `materials`
  ADD CONSTRAINT `fk_materials_category` FOREIGN KEY (`category_id`) REFERENCES `item_categories` (`id`),
  ADD CONSTRAINT `fk_materials_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_materials_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_materials_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `process_route_steps`
  ADD CONSTRAINT `fk_process_route_steps_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_process_route_steps_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_process_route_steps_owner` FOREIGN KEY (`default_owner_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_process_route_steps_route` FOREIGN KEY (`route_id`) REFERENCES `process_routes` (`id`),
  ADD CONSTRAINT `fk_process_route_steps_sop` FOREIGN KEY (`sop_file_id`) REFERENCES `technical_files` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_process_route_steps_step` FOREIGN KEY (`process_step_id`) REFERENCES `process_steps` (`id`),
  ADD CONSTRAINT `fk_process_route_steps_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `process_routes`
  ADD CONSTRAINT `fk_process_routes_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_process_routes_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_process_routes_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `process_steps`
  ADD CONSTRAINT `fk_process_steps_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_process_steps_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_process_steps_sop` FOREIGN KEY (`default_sop_file_id`) REFERENCES `technical_files` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_process_steps_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `product_materials`
  ADD CONSTRAINT `fk_product_materials_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_product_materials_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_product_materials_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`),
  ADD CONSTRAINT `fk_product_materials_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  ADD CONSTRAINT `fk_product_materials_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `products`
  ADD CONSTRAINT `fk_products_bom_approval_instance` FOREIGN KEY (`bom_approval_instance_id`) REFERENCES `approval_instances` (`id`),
  ADD CONSTRAINT `fk_products_bom_locked_by` FOREIGN KEY (`bom_locked_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_products_category` FOREIGN KEY (`category_id`) REFERENCES `item_categories` (`id`),
  ADD CONSTRAINT `fk_products_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_products_default_route` FOREIGN KEY (`default_route_id`) REFERENCES `process_routes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_products_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_products_specification_file` FOREIGN KEY (`specification_file_id`) REFERENCES `technical_files` (`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `fk_products_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `technical_files`
  ADD CONSTRAINT `fk_technical_files_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_technical_files_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_technical_files_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
