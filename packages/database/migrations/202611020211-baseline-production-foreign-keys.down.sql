-- One-time 20261102 baseline: phase 2, production.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Refuse to remove schema protection or data while business/seed rows remain.
CREATE TEMPORARY TABLE tmp_baseline_0211_down_guard (
  has_data TINYINT NOT NULL,
  CONSTRAINT chk_baseline_0211_empty CHECK (has_data = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_baseline_0211_down_guard (has_data)
SELECT 1
WHERE EXISTS (SELECT 1 FROM `approval_actions`)
   OR EXISTS (SELECT 1 FROM `approval_flow_definitions`)
   OR EXISTS (SELECT 1 FROM `approval_flow_steps`)
   OR EXISTS (SELECT 1 FROM `approval_flow_versions`)
   OR EXISTS (SELECT 1 FROM `approval_instance_steps`)
   OR EXISTS (SELECT 1 FROM `approval_instances`)
   OR EXISTS (SELECT 1 FROM `batch_step_abnormal_dispositions`)
   OR EXISTS (SELECT 1 FROM `batch_step_execution_actions`)
   OR EXISTS (SELECT 1 FROM `batch_step_records`)
   OR EXISTS (SELECT 1 FROM `batch_step_reports`)
   OR EXISTS (SELECT 1 FROM `batch_step_scrap_records`)
   OR EXISTS (SELECT 1 FROM `batch_step_scrap_reproduction_authorization`)
   OR EXISTS (SELECT 1 FROM `business_number_daily_sequence`)
   OR EXISTS (SELECT 1 FROM `business_templates`)
   OR EXISTS (SELECT 1 FROM `departments`)
   OR EXISTS (SELECT 1 FROM `http_idempotency_records`)
   OR EXISTS (SELECT 1 FROM `inbound_detail`)
   OR EXISTS (SELECT 1 FROM `inbound_order`)
   OR EXISTS (SELECT 1 FROM `inventory_batch_balance`)
   OR EXISTS (SELECT 1 FROM `inventory_material_variant_balance`)
   OR EXISTS (SELECT 1 FROM `inventory_transaction`)
   OR EXISTS (SELECT 1 FROM `item_batch`)
   OR EXISTS (SELECT 1 FROM `item_categories`)
   OR EXISTS (SELECT 1 FROM `item_scrap`)
   OR EXISTS (SELECT 1 FROM `material_variants`)
   OR EXISTS (SELECT 1 FROM `materials`)
   OR EXISTS (SELECT 1 FROM `notification_recipients`)
   OR EXISTS (SELECT 1 FROM `notifications`)
   OR EXISTS (SELECT 1 FROM `operation_logs`)
   OR EXISTS (SELECT 1 FROM `outbound_detail`)
   OR EXISTS (SELECT 1 FROM `outbound_order`)
   OR EXISTS (SELECT 1 FROM `process_route_steps`)
   OR EXISTS (SELECT 1 FROM `process_routes`)
   OR EXISTS (SELECT 1 FROM `process_steps`)
   OR EXISTS (SELECT 1 FROM `procurement_order`)
   OR EXISTS (SELECT 1 FROM `procurement_order_line`)
   OR EXISTS (SELECT 1 FROM `procurement_order_line_source`)
   OR EXISTS (SELECT 1 FROM `procurement_receipt`)
   OR EXISTS (SELECT 1 FROM `procurement_receipt_acceptance`)
   OR EXISTS (SELECT 1 FROM `procurement_receipt_allocation`)
   OR EXISTS (SELECT 1 FROM `procurement_receipt_line`)
   OR EXISTS (SELECT 1 FROM `procurement_receipt_revision`)
   OR EXISTS (SELECT 1 FROM `procurement_receipt_round`)
   OR EXISTS (SELECT 1 FROM `procurement_supplier`)
   OR EXISTS (SELECT 1 FROM `procurement_supplier_return`)
   OR EXISTS (SELECT 1 FROM `product_materials`)
   OR EXISTS (SELECT 1 FROM `production_batch_closeout`)
   OR EXISTS (SELECT 1 FROM `production_batch_closeout_action`)
   OR EXISTS (SELECT 1 FROM `production_batches`)
   OR EXISTS (SELECT 1 FROM `production_demand_correction`)
   OR EXISTS (SELECT 1 FROM `production_item_allocation`)
   OR EXISTS (SELECT 1 FROM `production_item_demand`)
   OR EXISTS (SELECT 1 FROM `production_manual_demand_addition`)
   OR EXISTS (SELECT 1 FROM `production_material_requirement_basis`)
   OR EXISTS (SELECT 1 FROM `production_material_supplement`)
   OR EXISTS (SELECT 1 FROM `production_output_allocation`)
   OR EXISTS (SELECT 1 FROM `production_output_revision`)
   OR EXISTS (SELECT 1 FROM `production_output_round`)
   OR EXISTS (SELECT 1 FROM `production_scrap_supplement_plan`)
   OR EXISTS (SELECT 1 FROM `production_scrap_supplement_plan_line`)
   OR EXISTS (SELECT 1 FROM `products`)
   OR EXISTS (SELECT 1 FROM `quality_incoming_inspection_order`)
   OR EXISTS (SELECT 1 FROM `quality_incoming_inspection_order_receipt`)
   OR EXISTS (SELECT 1 FROM `quality_inspection_case`)
   OR EXISTS (SELECT 1 FROM `quality_inspection_record`)
   OR EXISTS (SELECT 1 FROM `quality_process_inspection`)
   OR EXISTS (SELECT 1 FROM `quality_process_inspection_record`)
   OR EXISTS (SELECT 1 FROM `refresh_tokens`)
   OR EXISTS (SELECT 1 FROM `rework_records`)
   OR EXISTS (SELECT 1 FROM `role_permissions`)
   OR EXISTS (SELECT 1 FROM `roles`)
   OR EXISTS (SELECT 1 FROM `stock_check_detail`)
   OR EXISTS (SELECT 1 FROM `stock_check_order`)
   OR EXISTS (SELECT 1 FROM `technical_files`)
   OR EXISTS (SELECT 1 FROM `user_candidate_config_roles`)
   OR EXISTS (SELECT 1 FROM `user_candidate_configs`)
   OR EXISTS (SELECT 1 FROM `user_roles`)
   OR EXISTS (SELECT 1 FROM `users`)
   OR EXISTS (SELECT 1 FROM `work_orders`)
   OR EXISTS (
     SELECT 1 FROM permissions
     WHERE code NOT IN (
       '*',
       'dashboard:view',
       'system:user:view',
       'system:user:create',
       'system:user:update',
       'system:user:assign-roles',
       'system:role:view',
       'system:role:create',
       'system:role:update',
       'system:role:assign-permissions',
       'system:permission:view',
       'system:log:view',
       'system:user:reset-password',
       'system:role:delete',
       'product:view',
       'product:products:view',
       'product:products:create',
       'product:products:update',
       'product:products:change-status',
       'product:products:manage-bom',
       'product:products:set-default-route',
       'product:categories:view',
       'product:categories:create',
       'product:categories:update',
       'product:categories:change-status',
       'product:processes:view',
       'product:processes:create',
       'product:processes:update',
       'product:processes:change-status',
       'product:processes:upload-sop',
       'product:routes:view',
       'product:routes:create',
       'product:routes:update',
       'product:routes:change-status',
       'product:routes:manage-steps',
       'product:routes:delete',
       'product:files:view',
       'product:files:upload',
       'product:files:download',
       'product:files:attach',
       'system:view',
       'production:view',
       'production:orders:view',
       'production:orders:create',
       'production:orders:update',
       'production:orders:transition',
       'production:tasks:view',
       'production:batches:create',
       'production:batches:update',
       'production:batches:transition',
       'production:steps:report',
       'production:steps:manage-execution',
       'production:materials:view',
       'production:materials:allocate',
       'warehouse:outbound:create',
       'production:steps:assign',
       'production:steps:start',
       'production:worker-tasks:view',
       'production:trace:view',
       'warehouse:outbound:confirm',
       'warehouse:outbound:cancel',
       'warehouse:inventory:view',
       'warehouse:inbound:view',
       'warehouse:inbound:confirm-purchase',
       'production:steps:manage-abnormal',
       'production:rework:execute',
       'warehouse:view',
       'warehouse:returns:view',
       'warehouse:stock-checks:view',
       'warehouse:returns:create',
       'warehouse:returns:confirm',
       'warehouse:returns:cancel',
       'warehouse:stock-checks:create',
       'warehouse:stock-checks:count',
       'warehouse:stock-checks:complete',
       'warehouse:stock-checks:cancel',
       'warehouse:scraps:view',
       'warehouse:scraps:create',
       'warehouse:scraps:confirm',
       'warehouse:scraps:cancel',
       'product:material-variants:view',
       'product:material-variants:create',
       'product:material-variants:change-status',
       'production:material-demands:view',
       'production:material-demands:configure',
       'production:material-demands:add-manual',
       'product:materials:view',
       'product:materials:create',
       'product:materials:update',
       'product:materials:change-status',
       'approval:view',
       'approval:configure',
       'approval:decide',
       'production:tasks:terminate',
       'production:materials:correct-demand',
       'production:tasks:manage-output',
       'warehouse:inbound:confirm-finished',
       'procurement:view',
       'procurement:suppliers:view',
       'procurement:suppliers:create',
       'procurement:suppliers:update',
       'procurement:orders:view',
       'procurement:orders:create',
       'procurement:orders:update',
       'procurement:orders:place',
       'procurement:orders:cancel',
       'procurement:orders:close',
       'warehouse:receipts:view',
       'warehouse:receipts:confirm',
       'warehouse:receipts:correct',
       'warehouse:receipts:return',
       'quality:inbound-inspections:view',
       'quality:inbound-inspections:review',
       'quality:inbound-inspections:inspect',
       'quality:finished-inspections:view',
       'quality:finished-inspections:record',
       'warehouse:receipts:accept',
       'warehouse:other-inbounds:view',
       'warehouse:other-inbounds:create',
       'warehouse:other-inbounds:update',
       'warehouse:other-inbounds:confirm',
       'warehouse:other-inbounds:cancel',
       'warehouse:other-outbounds:view',
       'warehouse:other-outbounds:create',
       'warehouse:other-outbounds:update',
       'warehouse:other-outbounds:confirm',
       'warehouse:other-outbounds:cancel',
       'quality:view',
       'warehouse:outbound:view',
       'quality:process-inspections:view',
       'quality:process-inspections:record',
       'production:execution-records:view',
       'warehouse:receipts:void',
       'system:user-candidates:view',
       'system:user-candidates:configure',
       'quality:inbound-inspections:manage',
       'system:templates:view',
       'system:templates:create',
       'system:templates:update'
     )
   );

DROP TEMPORARY TABLE tmp_baseline_0211_down_guard;

ALTER TABLE `work_orders`
  DROP FOREIGN KEY `fk_work_orders_updated_by`,
  DROP FOREIGN KEY `fk_work_orders_product`,
  DROP FOREIGN KEY `fk_work_orders_previous_research`,
  DROP FOREIGN KEY `fk_work_orders_owner`,
  DROP FOREIGN KEY `fk_work_orders_created_by`,
  DROP FOREIGN KEY `fk_work_orders_closed_by`,
  DROP FOREIGN KEY `fk_work_orders_cancelled_by`;

ALTER TABLE `rework_records`
  DROP FOREIGN KEY `fk_rework_records_updated_by`,
  DROP FOREIGN KEY `fk_rework_records_step`,
  DROP FOREIGN KEY `fk_rework_records_source_report`,
  DROP FOREIGN KEY `fk_rework_records_responsible_user`,
  DROP FOREIGN KEY `fk_rework_records_disposition_source`,
  DROP FOREIGN KEY `fk_rework_records_created_by`,
  DROP FOREIGN KEY `fk_rework_records_completed_normal_report`,
  DROP FOREIGN KEY `fk_rework_records_completed_abnormal_report`,
  DROP FOREIGN KEY `fk_rework_disposition_step`;

ALTER TABLE `production_scrap_supplement_plan_line`
  DROP FOREIGN KEY `fk_scrap_supplement_plan_line_variant`,
  DROP FOREIGN KEY `fk_scrap_supplement_plan_line_basis_demand`,
  DROP FOREIGN KEY `fk_scrap_supplement_plan_line_basis`,
  DROP FOREIGN KEY `fk_production_scrap_supplement_plan_line_updated_by`,
  DROP FOREIGN KEY `fk_production_scrap_supplement_plan_line_plan`,
  DROP FOREIGN KEY `fk_production_scrap_supplement_plan_line_demand`,
  DROP FOREIGN KEY `fk_production_scrap_supplement_plan_line_created_by`;

ALTER TABLE `production_scrap_supplement_plan`
  DROP FOREIGN KEY `fk_scrap_plan_disposition_step`,
  DROP FOREIGN KEY `fk_production_scrap_supplement_plan_updated_by`,
  DROP FOREIGN KEY `fk_production_scrap_supplement_plan_supplement`,
  DROP FOREIGN KEY `fk_production_scrap_supplement_plan_disposition`,
  DROP FOREIGN KEY `fk_production_scrap_supplement_plan_created_by`;

ALTER TABLE `production_output_round`
  DROP FOREIGN KEY `fk_output_round_updater`,
  DROP FOREIGN KEY `fk_output_round_previous`,
  DROP FOREIGN KEY `fk_output_round_creator`,
  DROP FOREIGN KEY `fk_output_round_closeout`,
  DROP FOREIGN KEY `fk_output_round_base`;

ALTER TABLE `production_output_revision`
  DROP FOREIGN KEY `fk_output_revision_source`,
  DROP FOREIGN KEY `fk_output_revision_round`,
  DROP FOREIGN KEY `fk_output_revision_product`,
  DROP FOREIGN KEY `fk_output_revision_previous`,
  DROP FOREIGN KEY `fk_output_revision_order`,
  DROP FOREIGN KEY `fk_output_revision_inspection`,
  DROP FOREIGN KEY `fk_output_revision_approval`,
  DROP FOREIGN KEY `fk_output_revision_actor`;

ALTER TABLE `production_output_allocation`
  DROP FOREIGN KEY `fk_output_allocation_revision`,
  DROP FOREIGN KEY `fk_output_allocation_creator`;

ALTER TABLE `production_material_supplement`
  DROP FOREIGN KEY `fk_production_material_supplement_updated_by`,
  DROP FOREIGN KEY `fk_production_material_supplement_step_scrap`,
  DROP FOREIGN KEY `fk_production_material_supplement_fulfilled_by`,
  DROP FOREIGN KEY `fk_production_material_supplement_created_by`;

ALTER TABLE `production_material_requirement_basis`
  DROP FOREIGN KEY `fk_requirement_basis_locked_variant`,
  DROP FOREIGN KEY `fk_material_requirement_basis_material`,
  DROP FOREIGN KEY `fk_material_requirement_basis_created_by`,
  DROP FOREIGN KEY `fk_material_requirement_basis_bom`,
  DROP FOREIGN KEY `fk_material_requirement_basis_batch`;

ALTER TABLE `production_manual_demand_addition`
  DROP FOREIGN KEY `fk_manual_demand_addition_created_by`,
  DROP FOREIGN KEY `fk_manual_demand_addition_batch`;

ALTER TABLE `production_item_demand`
  DROP FOREIGN KEY `fk_production_item_demand_variant`,
  DROP FOREIGN KEY `fk_production_item_demand_updated_by`,
  DROP FOREIGN KEY `fk_production_item_demand_supplement`,
  DROP FOREIGN KEY `fk_production_item_demand_parent`,
  DROP FOREIGN KEY `fk_production_item_demand_material`,
  DROP FOREIGN KEY `fk_production_item_demand_manual_addition`,
  DROP FOREIGN KEY `fk_production_item_demand_item`,
  DROP FOREIGN KEY `fk_production_item_demand_fulfilled_by`,
  DROP FOREIGN KEY `fk_production_item_demand_created_by`,
  DROP FOREIGN KEY `fk_production_item_demand_cancelled_by`,
  DROP FOREIGN KEY `fk_production_item_demand_batch`,
  DROP FOREIGN KEY `fk_production_item_demand_basis`,
  DROP FOREIGN KEY `fk_demand_replacement`,
  DROP FOREIGN KEY `fk_demand_pending_correction`,
  DROP FOREIGN KEY `fk_demand_closer`,
  DROP FOREIGN KEY `fk_demand_closeout`,
  DROP FOREIGN KEY `fk_demand_close_correction`;

ALTER TABLE `production_item_allocation`
  DROP FOREIGN KEY `fk_production_item_allocation_updated_by`,
  DROP FOREIGN KEY `fk_production_item_allocation_stock_batch`,
  DROP FOREIGN KEY `fk_production_item_allocation_demand_variant`,
  DROP FOREIGN KEY `fk_production_item_allocation_demand_item`,
  DROP FOREIGN KEY `fk_production_item_allocation_demand_batch`,
  DROP FOREIGN KEY `fk_production_item_allocation_created_by`,
  DROP FOREIGN KEY `fk_production_item_allocation_batch_variant`;

ALTER TABLE `production_demand_correction`
  DROP FOREIGN KEY `fk_correction_updater`,
  DROP FOREIGN KEY `fk_correction_successor`,
  DROP FOREIGN KEY `fk_correction_demand`,
  DROP FOREIGN KEY `fk_correction_creator`,
  DROP FOREIGN KEY `fk_correction_approval`,
  DROP FOREIGN KEY `fk_correction_applier`;

ALTER TABLE `production_batches`
  DROP FOREIGN KEY `fk_production_batches_work_order_product`,
  DROP FOREIGN KEY `fk_production_batches_updated_by`,
  DROP FOREIGN KEY `fk_production_batches_route`,
  DROP FOREIGN KEY `fk_production_batches_owner`,
  DROP FOREIGN KEY `fk_production_batches_created_by`,
  DROP FOREIGN KEY `fk_production_batches_completed_by`,
  DROP FOREIGN KEY `fk_production_batches_cancelled_by`,
  DROP FOREIGN KEY `fk_production_batch_started_by`,
  DROP FOREIGN KEY `fk_production_batch_execution_completed_by`;

ALTER TABLE `production_batch_closeout_action`
  DROP FOREIGN KEY `fk_closeout_action_source`,
  DROP FOREIGN KEY `fk_closeout_action_actor`;

ALTER TABLE `production_batch_closeout`
  DROP FOREIGN KEY `fk_closeout_updater`,
  DROP FOREIGN KEY `fk_closeout_pending`,
  DROP FOREIGN KEY `fk_closeout_inspection`,
  DROP FOREIGN KEY `fk_closeout_current_round`,
  DROP FOREIGN KEY `fk_closeout_current_revision`,
  DROP FOREIGN KEY `fk_closeout_creator`,
  DROP FOREIGN KEY `fk_closeout_batch`,
  DROP FOREIGN KEY `fk_closeout_approval`;

ALTER TABLE `item_scrap`
  DROP FOREIGN KEY `fk_item_scrap_updated_by`,
  DROP FOREIGN KEY `fk_item_scrap_demand_batch`,
  DROP FOREIGN KEY `fk_item_scrap_created_by`,
  DROP FOREIGN KEY `fk_item_scrap_confirmed_by`,
  DROP FOREIGN KEY `fk_item_scrap_closeout_batch`,
  DROP FOREIGN KEY `fk_item_scrap_cancelled_by`,
  DROP FOREIGN KEY `fk_item_scrap_batch_variant`,
  DROP FOREIGN KEY `fk_item_scrap_batch_item`,
  DROP FOREIGN KEY `fk_item_scrap_batch`,
  DROP FOREIGN KEY `fk_item_scrap_allocation_variant`,
  DROP FOREIGN KEY `fk_item_scrap_allocation`;

ALTER TABLE `batch_step_scrap_reproduction_authorization`
  DROP FOREIGN KEY `fk_scrap_reproduction_authorization_supplement`,
  DROP FOREIGN KEY `fk_scrap_reproduction_authorization_scrap`,
  DROP FOREIGN KEY `fk_scrap_reproduction_authorization_entry_step`,
  DROP FOREIGN KEY `fk_scrap_reproduction_authorization_authorized_by`;

ALTER TABLE `batch_step_scrap_records`
  DROP FOREIGN KEY `fk_step_scrap_disposition_step`,
  DROP FOREIGN KEY `fk_batch_step_scrap_records_disposition_source`,
  DROP FOREIGN KEY `fk_batch_step_scrap_records_created_by`;

ALTER TABLE `batch_step_reports`
  DROP FOREIGN KEY `fk_batch_step_reports_step`,
  DROP FOREIGN KEY `fk_batch_step_reports_reversal`,
  DROP FOREIGN KEY `fk_batch_step_reports_replacement`,
  DROP FOREIGN KEY `fk_batch_step_reports_created_by`;

ALTER TABLE `batch_step_records`
  DROP FOREIGN KEY `fk_step_terminator`,
  DROP FOREIGN KEY `fk_step_closeout`,
  DROP FOREIGN KEY `fk_batch_step_records_updated_by`,
  DROP FOREIGN KEY `fk_batch_step_records_sop`,
  DROP FOREIGN KEY `fk_batch_step_records_route_step`,
  DROP FOREIGN KEY `fk_batch_step_records_responsible`,
  DROP FOREIGN KEY `fk_batch_step_records_default_responsible`,
  DROP FOREIGN KEY `fk_batch_step_records_created_by`,
  DROP FOREIGN KEY `fk_batch_step_records_batch`,
  DROP FOREIGN KEY `fk_batch_step_records_actual_sop`;

ALTER TABLE `batch_step_execution_actions`
  DROP FOREIGN KEY `fk_step_execution_action_source`,
  DROP FOREIGN KEY `fk_step_execution_action_actor`;

ALTER TABLE `batch_step_abnormal_dispositions`
  DROP FOREIGN KEY `fk_batch_step_abnormal_dispositions_updated_by`,
  DROP FOREIGN KEY `fk_batch_step_abnormal_dispositions_reviewer`,
  DROP FOREIGN KEY `fk_batch_step_abnormal_dispositions_report`,
  DROP FOREIGN KEY `fk_batch_step_abnormal_dispositions_created_by`,
  DROP FOREIGN KEY `fk_abnormal_disposition_step`,
  DROP FOREIGN KEY `fk_abnormal_disposition_inspection_record`,
  DROP FOREIGN KEY `fk_abnormal_disposition_inspection`;
