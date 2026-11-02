-- One-time 20261102 baseline: phase 2, inventory.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

ALTER TABLE `inbound_detail`
  ADD CONSTRAINT `fk_inbound_detail_batch_material` FOREIGN KEY (`batch_id`, `item_id`, `material_variant_id`) REFERENCES `item_batch` (`id`, `item_id`, `material_variant_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_detail_batch_product` FOREIGN KEY (`batch_id`, `product_id`) REFERENCES `item_batch` (`id`, `product_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_detail_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_detail_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_detail_demand_batch` FOREIGN KEY (`demand_id`, `production_batch_id`) REFERENCES `production_item_demand` (`id`, `production_batch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_detail_item` FOREIGN KEY (`item_id`) REFERENCES `materials` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_detail_order_batch` FOREIGN KEY (`inbound_id`, `production_batch_id`) REFERENCES `inbound_order` (`id`, `production_batch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_detail_order_source` FOREIGN KEY (`inbound_id`, `source_type`) REFERENCES `inbound_order` (`id`, `source_type`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_detail_output_allocation` FOREIGN KEY (`production_output_allocation_id`) REFERENCES `production_output_allocation` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_detail_procurement_allocation` FOREIGN KEY (`procurement_allocation_id`, `procurement_receipt_line_id`) REFERENCES `procurement_receipt_allocation` (`id`, `receipt_line_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_detail_procurement_inspection` FOREIGN KEY (`procurement_inspection_id`, `procurement_receipt_line_id`) REFERENCES `quality_inspection_record` (`id`, `receipt_line_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_detail_procurement_material` FOREIGN KEY (`procurement_receipt_line_id`, `item_id`, `material_variant_id`) REFERENCES `procurement_receipt_line` (`id`, `item_id`, `material_variant_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_detail_procurement_revision` FOREIGN KEY (`procurement_receipt_revision_id`, `procurement_receipt_line_id`) REFERENCES `procurement_receipt_revision` (`id`, `receipt_line_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_detail_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_detail_return_allocation` FOREIGN KEY (`return_allocation_id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`, `material_variant_id`) REFERENCES `production_item_allocation` (`id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`, `material_variant_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_detail_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_detail_variant` FOREIGN KEY (`material_variant_id`, `item_id`) REFERENCES `material_variants` (`id`, `material_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `inbound_order`
  ADD CONSTRAINT `fk_inbound_order_batch_product` FOREIGN KEY (`production_batch_id`, `product_id`) REFERENCES `production_batches` (`id`, `product_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_order_batch_work_order` FOREIGN KEY (`production_batch_id`, `work_order_id`) REFERENCES `production_batches` (`id`, `work_order_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_order_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_order_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_order_operator_id` FOREIGN KEY (`operator_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_order_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_order_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inbound_order_work_order` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `inventory_batch_balance`
  ADD CONSTRAINT `fk_inventory_batch_balance_batch_item` FOREIGN KEY (`batch_id`, `item_id`) REFERENCES `item_batch` (`id`, `item_id`),
  ADD CONSTRAINT `fk_inventory_batch_balance_batch_product` FOREIGN KEY (`batch_id`, `product_id`) REFERENCES `item_batch` (`id`, `product_id`);

ALTER TABLE `inventory_material_variant_balance`
  ADD CONSTRAINT `fk_inventory_variant_balance_variant` FOREIGN KEY (`material_variant_id`, `material_id`) REFERENCES `material_variants` (`id`, `material_id`);

ALTER TABLE `inventory_transaction`
  ADD CONSTRAINT `fk_inventory_transaction_batch_material` FOREIGN KEY (`batch_id`, `item_id`, `material_variant_id`) REFERENCES `item_batch` (`id`, `item_id`, `material_variant_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inventory_transaction_batch_product` FOREIGN KEY (`batch_id`, `product_id`) REFERENCES `item_batch` (`id`, `product_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inventory_transaction_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inventory_transaction_inbound_detail` FOREIGN KEY (`inbound_detail_ref`) REFERENCES `inbound_detail` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inventory_transaction_inbound_material` FOREIGN KEY (`inbound_detail_ref`, `item_id`, `material_variant_id`, `batch_id`) REFERENCES `inbound_detail` (`id`, `item_id`, `material_variant_id`, `batch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inventory_transaction_inbound_product` FOREIGN KEY (`inbound_detail_ref`, `product_id`, `batch_id`) REFERENCES `inbound_detail` (`id`, `product_id`, `batch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inventory_transaction_item` FOREIGN KEY (`item_id`) REFERENCES `materials` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inventory_transaction_outbound_detail` FOREIGN KEY (`outbound_detail_ref`) REFERENCES `outbound_detail` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inventory_transaction_outbound_material` FOREIGN KEY (`outbound_detail_ref`, `item_id`, `material_variant_id`, `batch_id`) REFERENCES `outbound_detail` (`id`, `item_id`, `material_variant_id`, `batch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inventory_transaction_outbound_product` FOREIGN KEY (`outbound_detail_ref`, `product_id`, `batch_id`) REFERENCES `outbound_detail` (`id`, `product_id`, `batch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inventory_transaction_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inventory_transaction_reversal` FOREIGN KEY (`reversal_of_transaction_id`) REFERENCES `inventory_transaction` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inventory_transaction_stock_check_detail` FOREIGN KEY (`stock_check_detail_ref`) REFERENCES `stock_check_detail` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inventory_transaction_stock_check_material` FOREIGN KEY (`stock_check_detail_ref`, `item_id`, `material_variant_id`, `batch_id`) REFERENCES `stock_check_detail` (`id`, `item_id`, `material_variant_id`, `batch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_inventory_transaction_variant` FOREIGN KEY (`material_variant_id`, `item_id`) REFERENCES `material_variants` (`id`, `material_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `item_batch`
  ADD CONSTRAINT `fk_item_batch_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_item_batch_item` FOREIGN KEY (`item_id`) REFERENCES `materials` (`id`),
  ADD CONSTRAINT `fk_item_batch_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  ADD CONSTRAINT `fk_item_batch_source_product` FOREIGN KEY (`source_production_batch_id`, `product_id`) REFERENCES `production_batches` (`id`, `product_id`),
  ADD CONSTRAINT `fk_item_batch_source_production` FOREIGN KEY (`source_production_batch_id`, `source_work_order_id`) REFERENCES `production_batches` (`id`, `work_order_id`),
  ADD CONSTRAINT `fk_item_batch_source_work_order` FOREIGN KEY (`source_work_order_id`) REFERENCES `work_orders` (`id`),
  ADD CONSTRAINT `fk_item_batch_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_item_batch_variant` FOREIGN KEY (`material_variant_id`, `item_id`) REFERENCES `material_variants` (`id`, `material_id`);

ALTER TABLE `outbound_detail`
  ADD CONSTRAINT `fk_outbound_detail_allocation` FOREIGN KEY (`allocation_id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`, `material_variant_id`) REFERENCES `production_item_allocation` (`id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`, `material_variant_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_outbound_detail_batch_material` FOREIGN KEY (`batch_id`, `item_id`, `material_variant_id`) REFERENCES `item_batch` (`id`, `item_id`, `material_variant_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_outbound_detail_batch_product` FOREIGN KEY (`batch_id`, `product_id`) REFERENCES `item_batch` (`id`, `product_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_outbound_detail_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_outbound_detail_deleted_by` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_outbound_detail_demand_batch` FOREIGN KEY (`demand_id`, `production_batch_id`) REFERENCES `production_item_demand` (`id`, `production_batch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_outbound_detail_item` FOREIGN KEY (`item_id`) REFERENCES `materials` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_outbound_detail_order_batch` FOREIGN KEY (`outbound_id`, `production_batch_id`) REFERENCES `outbound_order` (`id`, `production_batch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_outbound_detail_order_source` FOREIGN KEY (`outbound_id`, `source_type`) REFERENCES `outbound_order` (`id`, `source_type`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_outbound_detail_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_outbound_detail_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_outbound_detail_variant` FOREIGN KEY (`material_variant_id`, `item_id`) REFERENCES `material_variants` (`id`, `material_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `outbound_order`
  ADD CONSTRAINT `fk_outbound_order_batch_work_order` FOREIGN KEY (`production_batch_id`, `work_order_id`) REFERENCES `production_batches` (`id`, `work_order_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_outbound_order_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_outbound_order_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_outbound_order_operator_id` FOREIGN KEY (`operator_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_outbound_order_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_outbound_order_work_order` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `stock_check_detail`
  ADD CONSTRAINT `fk_stock_check_detail_batch_item` FOREIGN KEY (`batch_id`, `item_id`) REFERENCES `item_batch` (`id`, `item_id`),
  ADD CONSTRAINT `fk_stock_check_detail_batch_variant` FOREIGN KEY (`batch_id`, `item_id`, `material_variant_id`) REFERENCES `item_batch` (`id`, `item_id`, `material_variant_id`),
  ADD CONSTRAINT `fk_stock_check_detail_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_stock_check_detail_item` FOREIGN KEY (`item_id`) REFERENCES `materials` (`id`),
  ADD CONSTRAINT `fk_stock_check_detail_order` FOREIGN KEY (`stock_check_id`) REFERENCES `stock_check_order` (`id`),
  ADD CONSTRAINT `fk_stock_check_detail_variant` FOREIGN KEY (`material_variant_id`, `item_id`) REFERENCES `material_variants` (`id`, `material_id`);

ALTER TABLE `stock_check_order`
  ADD CONSTRAINT `fk_stock_check_order_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_stock_check_order_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_stock_check_order_operator` FOREIGN KEY (`operator_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_stock_check_order_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
