-- One-time 20261102 baseline: phase 2, procurement.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

ALTER TABLE `procurement_order`
  ADD CONSTRAINT `fk_procurement_order_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `procurement_supplier` (`id`),
  ADD CONSTRAINT `fk_procurement_order_work_order` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`),
  ADD CONSTRAINT `fk_purchase_order_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_purchase_order_orderer` FOREIGN KEY (`ordered_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_purchase_order_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `procurement_order_line`
  ADD CONSTRAINT `fk_purchase_order_line_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_purchase_order_line_item` FOREIGN KEY (`item_id`) REFERENCES `materials` (`id`),
  ADD CONSTRAINT `fk_purchase_order_line_order` FOREIGN KEY (`purchase_order_id`) REFERENCES `procurement_order` (`id`),
  ADD CONSTRAINT `fk_purchase_order_line_origin` FOREIGN KEY (`origin_order_line_id`) REFERENCES `procurement_order_line` (`id`),
  ADD CONSTRAINT `fk_purchase_order_line_origin_receipt` FOREIGN KEY (`origin_receipt_line_id`, `origin_order_line_id`) REFERENCES `procurement_receipt_line` (`id`, `purchase_order_line_id`),
  ADD CONSTRAINT `fk_purchase_order_line_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_purchase_order_line_variant` FOREIGN KEY (`material_variant_id`, `item_id`) REFERENCES `material_variants` (`id`, `material_id`);

ALTER TABLE `procurement_order_line_source`
  ADD CONSTRAINT `fk_purchase_order_source_demand` FOREIGN KEY (`demand_id`) REFERENCES `production_item_demand` (`id`),
  ADD CONSTRAINT `fk_purchase_order_source_line` FOREIGN KEY (`purchase_order_line_id`) REFERENCES `procurement_order_line` (`id`);

ALTER TABLE `procurement_receipt`
  ADD CONSTRAINT `fk_procurement_receipt_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_procurement_receipt_order` FOREIGN KEY (`purchase_order_id`) REFERENCES `procurement_order` (`id`),
  ADD CONSTRAINT `fk_procurement_receipt_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_procurement_receipt_voided_by` FOREIGN KEY (`voided_by`) REFERENCES `users` (`id`);

ALTER TABLE `procurement_receipt_acceptance`
  ADD CONSTRAINT `fk_receipt_acceptance_actor` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_receipt_acceptance_after` FOREIGN KEY (`after_receipt_revision_id`, `receipt_line_id`) REFERENCES `procurement_receipt_revision` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_receipt_acceptance_before` FOREIGN KEY (`before_receipt_revision_id`, `receipt_line_id`) REFERENCES `procurement_receipt_revision` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_receipt_acceptance_inspection` FOREIGN KEY (`inspection_record_id`, `receipt_line_id`) REFERENCES `quality_inspection_record` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_receipt_acceptance_previous` FOREIGN KEY (`previous_acceptance_id`, `receipt_line_id`) REFERENCES `procurement_receipt_acceptance` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_receipt_acceptance_receipt` FOREIGN KEY (`receipt_line_id`) REFERENCES `procurement_receipt_line` (`id`),
  ADD CONSTRAINT `fk_receipt_acceptance_round` FOREIGN KEY (`round_id`, `receipt_line_id`) REFERENCES `procurement_receipt_round` (`id`, `receipt_line_id`);

ALTER TABLE `procurement_receipt_allocation`
  ADD CONSTRAINT `fk_receipt_allocation_acceptance` FOREIGN KEY (`acceptance_id`, `receipt_line_id`, `round_id`) REFERENCES `procurement_receipt_acceptance` (`id`, `receipt_line_id`, `round_id`),
  ADD CONSTRAINT `fk_receipt_allocation_actor` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_receipt_allocation_round` FOREIGN KEY (`round_id`, `receipt_line_id`) REFERENCES `procurement_receipt_round` (`id`, `receipt_line_id`);

ALTER TABLE `procurement_receipt_line`
  ADD CONSTRAINT `fk_procurement_receipt_current_revision` FOREIGN KEY (`current_receipt_revision_id`, `id`) REFERENCES `procurement_receipt_revision` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_procurement_receipt_line_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_procurement_receipt_line_material` FOREIGN KEY (`purchase_order_line_id`, `item_id`, `material_variant_id`) REFERENCES `procurement_order_line` (`id`, `item_id`, `material_variant_id`),
  ADD CONSTRAINT `fk_procurement_receipt_line_order` FOREIGN KEY (`purchase_order_line_id`, `purchase_order_id`) REFERENCES `procurement_order_line` (`id`, `purchase_order_id`),
  ADD CONSTRAINT `fk_procurement_receipt_line_receipt` FOREIGN KEY (`receipt_id`, `purchase_order_id`) REFERENCES `procurement_receipt` (`id`, `purchase_order_id`),
  ADD CONSTRAINT `fk_procurement_receipt_line_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_receipt_line_current_round` FOREIGN KEY (`current_round_id`, `id`) REFERENCES `procurement_receipt_round` (`id`, `receipt_line_id`);

ALTER TABLE `procurement_receipt_revision`
  ADD CONSTRAINT `fk_procurement_revision_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_procurement_revision_line` FOREIGN KEY (`receipt_line_id`) REFERENCES `procurement_receipt_line` (`id`),
  ADD CONSTRAINT `fk_procurement_revision_previous` FOREIGN KEY (`previous_revision_id`, `receipt_line_id`) REFERENCES `procurement_receipt_revision` (`id`, `receipt_line_id`);

ALTER TABLE `procurement_receipt_round`
  ADD CONSTRAINT `fk_receipt_round_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_receipt_round_inspection` FOREIGN KEY (`inspection_id`, `receipt_line_id`) REFERENCES `quality_inspection_record` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_receipt_round_line` FOREIGN KEY (`receipt_line_id`) REFERENCES `procurement_receipt_line` (`id`),
  ADD CONSTRAINT `fk_receipt_round_previous` FOREIGN KEY (`previous_round_id`, `receipt_line_id`) REFERENCES `procurement_receipt_round` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_receipt_round_revision` FOREIGN KEY (`receipt_revision_id`, `receipt_line_id`) REFERENCES `procurement_receipt_revision` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_receipt_round_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_round_allocation_source` FOREIGN KEY (`source_allocation_round_id`, `receipt_line_id`) REFERENCES `procurement_receipt_round` (`id`, `receipt_line_id`);

ALTER TABLE `procurement_supplier`
  ADD CONSTRAINT `fk_procurement_supplier_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_procurement_supplier_deleter` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_procurement_supplier_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `procurement_supplier_return`
  ADD CONSTRAINT `fk_procurement_return_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_procurement_return_inspection` FOREIGN KEY (`inspection_id`, `receipt_line_id`) REFERENCES `quality_inspection_record` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_procurement_return_revision` FOREIGN KEY (`receipt_revision_id`, `receipt_line_id`) REFERENCES `procurement_receipt_revision` (`id`, `receipt_line_id`),
  ADD CONSTRAINT `fk_supplier_return_allocation` FOREIGN KEY (`allocation_id`, `receipt_line_id`) REFERENCES `procurement_receipt_allocation` (`id`, `receipt_line_id`);
