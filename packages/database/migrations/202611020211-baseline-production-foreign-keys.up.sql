-- One-time 20261102 baseline: phase 2, production.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

ALTER TABLE `batch_step_abnormal_dispositions`
  ADD CONSTRAINT `fk_abnormal_disposition_inspection` FOREIGN KEY (`process_inspection_id`, `production_batch_id`, `batch_step_record_id`) REFERENCES `quality_process_inspection` (`id`, `production_batch_id`, `batch_step_record_id`),
  ADD CONSTRAINT `fk_abnormal_disposition_inspection_record` FOREIGN KEY (`process_inspection_record_id`, `process_inspection_id`) REFERENCES `quality_process_inspection_record` (`id`, `inspection_id`),
  ADD CONSTRAINT `fk_abnormal_disposition_step` FOREIGN KEY (`batch_step_record_id`, `production_batch_id`) REFERENCES `batch_step_records` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_batch_step_abnormal_dispositions_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_batch_step_abnormal_dispositions_report` FOREIGN KEY (`batch_step_report_id`, `batch_step_record_id`, `production_batch_id`) REFERENCES `batch_step_reports` (`id`, `batch_step_record_id`, `production_batch_id`),
  ADD CONSTRAINT `fk_batch_step_abnormal_dispositions_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_batch_step_abnormal_dispositions_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `batch_step_execution_actions`
  ADD CONSTRAINT `fk_step_execution_action_actor` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_step_execution_action_source` FOREIGN KEY (`batch_step_record_id`, `production_batch_id`) REFERENCES `batch_step_records` (`id`, `production_batch_id`);

ALTER TABLE `batch_step_records`
  ADD CONSTRAINT `fk_batch_step_records_actual_sop` FOREIGN KEY (`actual_sop_file_id`) REFERENCES `technical_files` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_batch_step_records_batch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`id`),
  ADD CONSTRAINT `fk_batch_step_records_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_batch_step_records_default_responsible` FOREIGN KEY (`default_responsible_user_id_snapshot`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_batch_step_records_responsible` FOREIGN KEY (`responsible_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_batch_step_records_route_step` FOREIGN KEY (`route_step_id`) REFERENCES `process_route_steps` (`id`),
  ADD CONSTRAINT `fk_batch_step_records_sop` FOREIGN KEY (`sop_file_id_snapshot`) REFERENCES `technical_files` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_batch_step_records_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_step_closeout` FOREIGN KEY (`closeout_id`, `production_batch_id`) REFERENCES `production_batch_closeout` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_step_terminator` FOREIGN KEY (`terminated_by`) REFERENCES `users` (`id`);

ALTER TABLE `batch_step_reports`
  ADD CONSTRAINT `fk_batch_step_reports_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_batch_step_reports_replacement` FOREIGN KEY (`replaces_report_id`, `batch_step_record_id`, `production_batch_id`) REFERENCES `batch_step_reports` (`id`, `batch_step_record_id`, `production_batch_id`),
  ADD CONSTRAINT `fk_batch_step_reports_reversal` FOREIGN KEY (`reversal_of_report_id`, `batch_step_record_id`, `production_batch_id`) REFERENCES `batch_step_reports` (`id`, `batch_step_record_id`, `production_batch_id`),
  ADD CONSTRAINT `fk_batch_step_reports_step` FOREIGN KEY (`batch_step_record_id`, `production_batch_id`) REFERENCES `batch_step_records` (`id`, `production_batch_id`);

ALTER TABLE `batch_step_scrap_records`
  ADD CONSTRAINT `fk_batch_step_scrap_records_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_batch_step_scrap_records_disposition_source` FOREIGN KEY (`abnormal_disposition_id`, `production_batch_id`, `batch_step_record_id`, `source_report_id`) REFERENCES `batch_step_abnormal_dispositions` (`id`, `production_batch_id`, `batch_step_record_id`, `batch_step_report_id`),
  ADD CONSTRAINT `fk_step_scrap_disposition_step` FOREIGN KEY (`abnormal_disposition_id`, `production_batch_id`, `batch_step_record_id`) REFERENCES `batch_step_abnormal_dispositions` (`id`, `production_batch_id`, `batch_step_record_id`);

ALTER TABLE `batch_step_scrap_reproduction_authorization`
  ADD CONSTRAINT `fk_scrap_reproduction_authorization_authorized_by` FOREIGN KEY (`authorized_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_scrap_reproduction_authorization_entry_step` FOREIGN KEY (`entry_step_record_id`, `production_batch_id`) REFERENCES `batch_step_records` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_scrap_reproduction_authorization_scrap` FOREIGN KEY (`scrap_record_id`, `production_batch_id`, `quota_end_step_record_id`) REFERENCES `batch_step_scrap_records` (`id`, `production_batch_id`, `batch_step_record_id`),
  ADD CONSTRAINT `fk_scrap_reproduction_authorization_supplement` FOREIGN KEY (`supplement_id`, `production_batch_id`) REFERENCES `production_material_supplement` (`id`, `production_batch_id`);

ALTER TABLE `item_scrap`
  ADD CONSTRAINT `fk_item_scrap_allocation` FOREIGN KEY (`allocation_id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`) REFERENCES `production_item_allocation` (`id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`),
  ADD CONSTRAINT `fk_item_scrap_allocation_variant` FOREIGN KEY (`allocation_id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`, `material_variant_id`) REFERENCES `production_item_allocation` (`id`, `demand_id`, `production_batch_id`, `item_id`, `batch_id`, `material_variant_id`),
  ADD CONSTRAINT `fk_item_scrap_batch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`id`),
  ADD CONSTRAINT `fk_item_scrap_batch_item` FOREIGN KEY (`batch_id`, `item_id`) REFERENCES `item_batch` (`id`, `item_id`),
  ADD CONSTRAINT `fk_item_scrap_batch_variant` FOREIGN KEY (`batch_id`, `item_id`, `material_variant_id`) REFERENCES `item_batch` (`id`, `item_id`, `material_variant_id`),
  ADD CONSTRAINT `fk_item_scrap_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_item_scrap_closeout_batch` FOREIGN KEY (`closeout_id`, `production_batch_id`) REFERENCES `production_batch_closeout` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_item_scrap_confirmed_by` FOREIGN KEY (`confirmed_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_item_scrap_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_item_scrap_demand_batch` FOREIGN KEY (`demand_id`, `production_batch_id`) REFERENCES `production_item_demand` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_item_scrap_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `production_batch_closeout`
  ADD CONSTRAINT `fk_closeout_approval` FOREIGN KEY (`approval_instance_id`) REFERENCES `approval_instances` (`id`),
  ADD CONSTRAINT `fk_closeout_batch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`id`),
  ADD CONSTRAINT `fk_closeout_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_closeout_current_revision` FOREIGN KEY (`current_revision_id`, `id`) REFERENCES `production_output_revision` (`id`, `closeout_id`),
  ADD CONSTRAINT `fk_closeout_current_round` FOREIGN KEY (`current_round_id`, `id`) REFERENCES `production_output_round` (`id`, `closeout_id`),
  ADD CONSTRAINT `fk_closeout_inspection` FOREIGN KEY (`inspection_record_id`, `id`) REFERENCES `quality_inspection_record` (`id`, `closeout_id`),
  ADD CONSTRAINT `fk_closeout_pending` FOREIGN KEY (`pending_approval_id`) REFERENCES `approval_instances` (`id`),
  ADD CONSTRAINT `fk_closeout_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `production_batch_closeout_action`
  ADD CONSTRAINT `fk_closeout_action_actor` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_closeout_action_source` FOREIGN KEY (`closeout_id`) REFERENCES `production_batch_closeout` (`id`);

ALTER TABLE `production_batches`
  ADD CONSTRAINT `fk_production_batch_execution_completed_by` FOREIGN KEY (`execution_completed_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_production_batch_started_by` FOREIGN KEY (`started_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_production_batches_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_production_batches_completed_by` FOREIGN KEY (`completed_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_production_batches_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_production_batches_owner` FOREIGN KEY (`batch_owner_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_production_batches_route` FOREIGN KEY (`route_id`) REFERENCES `process_routes` (`id`),
  ADD CONSTRAINT `fk_production_batches_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_production_batches_work_order_product` FOREIGN KEY (`work_order_id`, `product_id`) REFERENCES `work_orders` (`id`, `product_id`);

ALTER TABLE `production_demand_correction`
  ADD CONSTRAINT `fk_correction_applier` FOREIGN KEY (`applied_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_correction_approval` FOREIGN KEY (`approval_instance_id`) REFERENCES `approval_instances` (`id`),
  ADD CONSTRAINT `fk_correction_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_correction_demand` FOREIGN KEY (`old_demand_id`, `production_batch_id`) REFERENCES `production_item_demand` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_correction_successor` FOREIGN KEY (`new_demand_id`, `production_batch_id`) REFERENCES `production_item_demand` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_correction_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `production_item_allocation`
  ADD CONSTRAINT `fk_production_item_allocation_batch_variant` FOREIGN KEY (`batch_id`, `item_id`, `material_variant_id`) REFERENCES `item_batch` (`id`, `item_id`, `material_variant_id`),
  ADD CONSTRAINT `fk_production_item_allocation_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_production_item_allocation_demand_batch` FOREIGN KEY (`demand_id`, `production_batch_id`) REFERENCES `production_item_demand` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_production_item_allocation_demand_item` FOREIGN KEY (`demand_id`, `item_id`) REFERENCES `production_item_demand` (`id`, `item_id`),
  ADD CONSTRAINT `fk_production_item_allocation_demand_variant` FOREIGN KEY (`demand_id`, `item_id`, `material_variant_id`) REFERENCES `production_item_demand` (`id`, `item_id`, `material_variant_id`),
  ADD CONSTRAINT `fk_production_item_allocation_stock_batch` FOREIGN KEY (`batch_id`, `item_id`) REFERENCES `item_batch` (`id`, `item_id`),
  ADD CONSTRAINT `fk_production_item_allocation_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `production_item_demand`
  ADD CONSTRAINT `fk_demand_close_correction` FOREIGN KEY (`close_correction_id`, `id`) REFERENCES `production_demand_correction` (`id`, `old_demand_id`),
  ADD CONSTRAINT `fk_demand_closeout` FOREIGN KEY (`closeout_id`, `production_batch_id`) REFERENCES `production_batch_closeout` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_demand_closer` FOREIGN KEY (`closed_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_demand_pending_correction` FOREIGN KEY (`pending_correction_id`, `id`) REFERENCES `production_demand_correction` (`id`, `old_demand_id`),
  ADD CONSTRAINT `fk_demand_replacement` FOREIGN KEY (`replaces_demand_id`) REFERENCES `production_item_demand` (`id`),
  ADD CONSTRAINT `fk_production_item_demand_basis` FOREIGN KEY (`requirement_basis_id`, `production_batch_id`, `product_material_id`, `item_id`, `material_variant_id`) REFERENCES `production_material_requirement_basis` (`id`, `production_batch_id`, `product_material_id`, `material_id`, `locked_material_variant_id`),
  ADD CONSTRAINT `fk_production_item_demand_batch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`id`),
  ADD CONSTRAINT `fk_production_item_demand_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_production_item_demand_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_production_item_demand_fulfilled_by` FOREIGN KEY (`fulfilled_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_production_item_demand_item` FOREIGN KEY (`item_id`) REFERENCES `materials` (`id`),
  ADD CONSTRAINT `fk_production_item_demand_manual_addition` FOREIGN KEY (`manual_addition_id`, `production_batch_id`) REFERENCES `production_manual_demand_addition` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_production_item_demand_material` FOREIGN KEY (`product_material_id`, `item_id`) REFERENCES `product_materials` (`id`, `material_id`),
  ADD CONSTRAINT `fk_production_item_demand_parent` FOREIGN KEY (`parent_demand_id`, `production_batch_id`, `product_material_id`, `item_id`) REFERENCES `production_item_demand` (`id`, `production_batch_id`, `product_material_id`, `item_id`),
  ADD CONSTRAINT `fk_production_item_demand_supplement` FOREIGN KEY (`supplement_id`, `production_batch_id`) REFERENCES `production_material_supplement` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_production_item_demand_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_production_item_demand_variant` FOREIGN KEY (`material_variant_id`, `item_id`) REFERENCES `material_variants` (`id`, `material_id`);

ALTER TABLE `production_manual_demand_addition`
  ADD CONSTRAINT `fk_manual_demand_addition_batch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`id`),
  ADD CONSTRAINT `fk_manual_demand_addition_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

ALTER TABLE `production_material_requirement_basis`
  ADD CONSTRAINT `fk_material_requirement_basis_batch` FOREIGN KEY (`production_batch_id`) REFERENCES `production_batches` (`id`),
  ADD CONSTRAINT `fk_material_requirement_basis_bom` FOREIGN KEY (`product_material_id`, `material_id`) REFERENCES `product_materials` (`id`, `material_id`),
  ADD CONSTRAINT `fk_material_requirement_basis_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_material_requirement_basis_material` FOREIGN KEY (`material_id`) REFERENCES `materials` (`id`),
  ADD CONSTRAINT `fk_requirement_basis_locked_variant` FOREIGN KEY (`locked_material_variant_id`, `material_id`) REFERENCES `material_variants` (`id`, `material_id`);

ALTER TABLE `production_material_supplement`
  ADD CONSTRAINT `fk_production_material_supplement_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_production_material_supplement_fulfilled_by` FOREIGN KEY (`fulfilled_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_production_material_supplement_step_scrap` FOREIGN KEY (`step_scrap_record_id`, `production_batch_id`, `batch_step_record_id`) REFERENCES `batch_step_scrap_records` (`id`, `production_batch_id`, `batch_step_record_id`),
  ADD CONSTRAINT `fk_production_material_supplement_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `production_output_allocation`
  ADD CONSTRAINT `fk_output_allocation_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_output_allocation_revision` FOREIGN KEY (`revision_id`, `round_id`, `closeout_id`) REFERENCES `production_output_revision` (`id`, `round_id`, `closeout_id`);

ALTER TABLE `production_output_revision`
  ADD CONSTRAINT `fk_output_revision_actor` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_output_revision_approval` FOREIGN KEY (`approval_instance_id`) REFERENCES `approval_instances` (`id`),
  ADD CONSTRAINT `fk_output_revision_inspection` FOREIGN KEY (`inspection_record_id`, `closeout_id`) REFERENCES `quality_inspection_record` (`id`, `closeout_id`),
  ADD CONSTRAINT `fk_output_revision_order` FOREIGN KEY (`production_batch_id`, `work_order_id`) REFERENCES `production_batches` (`id`, `work_order_id`),
  ADD CONSTRAINT `fk_output_revision_previous` FOREIGN KEY (`previous_revision_id`, `closeout_id`) REFERENCES `production_output_revision` (`id`, `closeout_id`),
  ADD CONSTRAINT `fk_output_revision_product` FOREIGN KEY (`production_batch_id`, `product_id`) REFERENCES `production_batches` (`id`, `product_id`),
  ADD CONSTRAINT `fk_output_revision_round` FOREIGN KEY (`round_id`, `closeout_id`) REFERENCES `production_output_round` (`id`, `closeout_id`),
  ADD CONSTRAINT `fk_output_revision_source` FOREIGN KEY (`closeout_id`, `production_batch_id`) REFERENCES `production_batch_closeout` (`id`, `production_batch_id`);

ALTER TABLE `production_output_round`
  ADD CONSTRAINT `fk_output_round_base` FOREIGN KEY (`base_revision_id`, `closeout_id`) REFERENCES `production_output_revision` (`id`, `closeout_id`),
  ADD CONSTRAINT `fk_output_round_closeout` FOREIGN KEY (`closeout_id`) REFERENCES `production_batch_closeout` (`id`),
  ADD CONSTRAINT `fk_output_round_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_output_round_previous` FOREIGN KEY (`previous_round_id`, `closeout_id`) REFERENCES `production_output_round` (`id`, `closeout_id`),
  ADD CONSTRAINT `fk_output_round_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `production_scrap_supplement_plan`
  ADD CONSTRAINT `fk_production_scrap_supplement_plan_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_production_scrap_supplement_plan_disposition` FOREIGN KEY (`abnormal_disposition_id`, `production_batch_id`, `batch_step_record_id`, `source_report_id`) REFERENCES `batch_step_abnormal_dispositions` (`id`, `production_batch_id`, `batch_step_record_id`, `batch_step_report_id`),
  ADD CONSTRAINT `fk_production_scrap_supplement_plan_supplement` FOREIGN KEY (`confirmed_supplement_id`, `production_batch_id`) REFERENCES `production_material_supplement` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_production_scrap_supplement_plan_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_scrap_plan_disposition_step` FOREIGN KEY (`abnormal_disposition_id`, `production_batch_id`, `batch_step_record_id`) REFERENCES `batch_step_abnormal_dispositions` (`id`, `production_batch_id`, `batch_step_record_id`);

ALTER TABLE `production_scrap_supplement_plan_line`
  ADD CONSTRAINT `fk_production_scrap_supplement_plan_line_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_production_scrap_supplement_plan_line_demand` FOREIGN KEY (`original_demand_id`, `production_batch_id`, `product_material_id`, `item_id`) REFERENCES `production_item_demand` (`id`, `production_batch_id`, `product_material_id`, `item_id`),
  ADD CONSTRAINT `fk_production_scrap_supplement_plan_line_plan` FOREIGN KEY (`plan_id`, `production_batch_id`) REFERENCES `production_scrap_supplement_plan` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_production_scrap_supplement_plan_line_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_scrap_supplement_plan_line_basis` FOREIGN KEY (`requirement_basis_id`, `production_batch_id`, `product_material_id`, `item_id`) REFERENCES `production_material_requirement_basis` (`id`, `production_batch_id`, `product_material_id`, `material_id`),
  ADD CONSTRAINT `fk_scrap_supplement_plan_line_basis_demand` FOREIGN KEY (`original_demand_id`, `production_batch_id`, `requirement_basis_id`) REFERENCES `production_item_demand` (`id`, `production_batch_id`, `requirement_basis_id`),
  ADD CONSTRAINT `fk_scrap_supplement_plan_line_variant` FOREIGN KEY (`material_variant_id`, `item_id`) REFERENCES `material_variants` (`id`, `material_id`);

ALTER TABLE `rework_records`
  ADD CONSTRAINT `fk_rework_disposition_step` FOREIGN KEY (`abnormal_disposition_id`, `production_batch_id`, `batch_step_record_id`) REFERENCES `batch_step_abnormal_dispositions` (`id`, `production_batch_id`, `batch_step_record_id`),
  ADD CONSTRAINT `fk_rework_records_completed_abnormal_report` FOREIGN KEY (`completed_abnormal_report_id`, `batch_step_record_id`, `production_batch_id`) REFERENCES `batch_step_reports` (`id`, `batch_step_record_id`, `production_batch_id`),
  ADD CONSTRAINT `fk_rework_records_completed_normal_report` FOREIGN KEY (`completed_normal_report_id`, `batch_step_record_id`, `production_batch_id`) REFERENCES `batch_step_reports` (`id`, `batch_step_record_id`, `production_batch_id`),
  ADD CONSTRAINT `fk_rework_records_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_rework_records_disposition_source` FOREIGN KEY (`abnormal_disposition_id`, `production_batch_id`, `batch_step_record_id`, `source_report_id`) REFERENCES `batch_step_abnormal_dispositions` (`id`, `production_batch_id`, `batch_step_record_id`, `batch_step_report_id`),
  ADD CONSTRAINT `fk_rework_records_responsible_user` FOREIGN KEY (`responsible_user_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_rework_records_source_report` FOREIGN KEY (`source_report_id`, `batch_step_record_id`, `production_batch_id`) REFERENCES `batch_step_reports` (`id`, `batch_step_record_id`, `production_batch_id`),
  ADD CONSTRAINT `fk_rework_records_step` FOREIGN KEY (`batch_step_record_id`, `production_batch_id`) REFERENCES `batch_step_records` (`id`, `production_batch_id`),
  ADD CONSTRAINT `fk_rework_records_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);

ALTER TABLE `work_orders`
  ADD CONSTRAINT `fk_work_orders_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_work_orders_closed_by` FOREIGN KEY (`closed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_work_orders_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_work_orders_owner` FOREIGN KEY (`work_order_owner_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_work_orders_previous_research` FOREIGN KEY (`previous_research_order_id`) REFERENCES `work_orders` (`id`),
  ADD CONSTRAINT `fk_work_orders_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`),
  ADD CONSTRAINT `fk_work_orders_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
