-- One-time 20261102 baseline: phase 2, identity.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Refuse to remove schema protection or data while business/seed rows remain.
CREATE TEMPORARY TABLE tmp_baseline_0201_down_guard (
  has_data TINYINT NOT NULL,
  CONSTRAINT chk_baseline_0201_empty CHECK (has_data = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_baseline_0201_down_guard (has_data)
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

DROP TEMPORARY TABLE tmp_baseline_0201_down_guard;

ALTER TABLE `users`
  DROP FOREIGN KEY `fk_users_department`;

ALTER TABLE `user_roles`
  DROP FOREIGN KEY `fk_user_roles_user`,
  DROP FOREIGN KEY `fk_user_roles_role`;

ALTER TABLE `user_candidate_configs`
  DROP FOREIGN KEY `fk_user_candidate_configs_updated_by`,
  DROP FOREIGN KEY `fk_user_candidate_configs_deleted_by`,
  DROP FOREIGN KEY `fk_user_candidate_configs_created_by`;

ALTER TABLE `user_candidate_config_roles`
  DROP FOREIGN KEY `fk_user_candidate_config_roles_role`,
  DROP FOREIGN KEY `fk_user_candidate_config_roles_config`;

ALTER TABLE `role_permissions`
  DROP FOREIGN KEY `fk_role_permissions_role`,
  DROP FOREIGN KEY `fk_role_permissions_permission`;

ALTER TABLE `refresh_tokens`
  DROP FOREIGN KEY `fk_refresh_tokens_user`;

ALTER TABLE `permissions`
  DROP FOREIGN KEY `fk_permissions_parent`;

ALTER TABLE `departments`
  DROP FOREIGN KEY `fk_departments_parent`;
