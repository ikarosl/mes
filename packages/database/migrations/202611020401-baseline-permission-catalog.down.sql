-- One-time 20261102 baseline: phase 4, identity.
-- Final schema reproduced from all 118 historical migrations; later changes are append-only.

-- Refuse to remove schema protection or data while business/seed rows remain.
CREATE TEMPORARY TABLE tmp_baseline_0401_down_guard (
  has_data TINYINT NOT NULL,
  CONSTRAINT chk_baseline_0401_empty CHECK (has_data = 0)
) ENGINE=MEMORY;

INSERT INTO tmp_baseline_0401_down_guard (has_data)
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

DROP TEMPORARY TABLE tmp_baseline_0401_down_guard;

-- Delete leaves before parents without detaching or rewriting the catalog hierarchy.
START TRANSACTION;

DELETE FROM permissions WHERE id = '177' AND code = 'system:templates:update';
DELETE FROM permissions WHERE id = '176' AND code = 'system:templates:create';
DELETE FROM permissions WHERE id = '174' AND code = 'quality:inbound-inspections:manage';
DELETE FROM permissions WHERE id = '173' AND code = 'system:user-candidates:configure';
DELETE FROM permissions WHERE id = '171' AND code = 'warehouse:receipts:void';
DELETE FROM permissions WHERE id = '169' AND code = 'quality:process-inspections:record';
DELETE FROM permissions WHERE id = '164' AND code = 'warehouse:other-outbounds:cancel';
DELETE FROM permissions WHERE id = '163' AND code = 'warehouse:other-outbounds:confirm';
DELETE FROM permissions WHERE id = '162' AND code = 'warehouse:other-outbounds:update';
DELETE FROM permissions WHERE id = '161' AND code = 'warehouse:other-outbounds:create';
DELETE FROM permissions WHERE id = '159' AND code = 'warehouse:other-inbounds:cancel';
DELETE FROM permissions WHERE id = '158' AND code = 'warehouse:other-inbounds:confirm';
DELETE FROM permissions WHERE id = '157' AND code = 'warehouse:other-inbounds:update';
DELETE FROM permissions WHERE id = '156' AND code = 'warehouse:other-inbounds:create';
DELETE FROM permissions WHERE id = '154' AND code = 'warehouse:receipts:accept';
DELETE FROM permissions WHERE id = '153' AND code = 'quality:finished-inspections:record';
DELETE FROM permissions WHERE id = '151' AND code = 'quality:inbound-inspections:inspect';
DELETE FROM permissions WHERE id = '150' AND code = 'quality:inbound-inspections:review';
DELETE FROM permissions WHERE id = '148' AND code = 'warehouse:receipts:return';
DELETE FROM permissions WHERE id = '147' AND code = 'warehouse:receipts:correct';
DELETE FROM permissions WHERE id = '146' AND code = 'warehouse:receipts:confirm';
DELETE FROM permissions WHERE id = '144' AND code = 'procurement:orders:close';
DELETE FROM permissions WHERE id = '143' AND code = 'procurement:orders:cancel';
DELETE FROM permissions WHERE id = '142' AND code = 'procurement:orders:place';
DELETE FROM permissions WHERE id = '141' AND code = 'procurement:orders:update';
DELETE FROM permissions WHERE id = '140' AND code = 'procurement:orders:create';
DELETE FROM permissions WHERE id = '138' AND code = 'procurement:suppliers:update';
DELETE FROM permissions WHERE id = '137' AND code = 'procurement:suppliers:create';
DELETE FROM permissions WHERE id = '133' AND code = 'warehouse:inbound:confirm-finished';
DELETE FROM permissions WHERE id = '130' AND code = 'production:tasks:manage-output';
DELETE FROM permissions WHERE id = '129' AND code = 'production:materials:correct-demand';
DELETE FROM permissions WHERE id = '128' AND code = 'production:tasks:terminate';
DELETE FROM permissions WHERE id = '120' AND code = 'product:materials:change-status';
DELETE FROM permissions WHERE id = '119' AND code = 'product:materials:update';
DELETE FROM permissions WHERE id = '118' AND code = 'product:materials:create';
DELETE FROM permissions WHERE id = '117' AND code = 'product:materials:view';
DELETE FROM permissions WHERE id = '116' AND code = 'production:material-demands:add-manual';
DELETE FROM permissions WHERE id = '115' AND code = 'production:material-demands:configure';
DELETE FROM permissions WHERE id = '114' AND code = 'production:material-demands:view';
DELETE FROM permissions WHERE id = '113' AND code = 'product:material-variants:change-status';
DELETE FROM permissions WHERE id = '112' AND code = 'product:material-variants:create';
DELETE FROM permissions WHERE id = '111' AND code = 'product:material-variants:view';
DELETE FROM permissions WHERE id = '107' AND code = 'warehouse:scraps:cancel';
DELETE FROM permissions WHERE id = '106' AND code = 'warehouse:scraps:confirm';
DELETE FROM permissions WHERE id = '105' AND code = 'warehouse:scraps:create';
DELETE FROM permissions WHERE id = '103' AND code = 'warehouse:stock-checks:cancel';
DELETE FROM permissions WHERE id = '102' AND code = 'warehouse:stock-checks:complete';
DELETE FROM permissions WHERE id = '101' AND code = 'warehouse:stock-checks:count';
DELETE FROM permissions WHERE id = '100' AND code = 'warehouse:stock-checks:create';
DELETE FROM permissions WHERE id = '99' AND code = 'warehouse:returns:cancel';
DELETE FROM permissions WHERE id = '98' AND code = 'warehouse:returns:confirm';
DELETE FROM permissions WHERE id = '97' AND code = 'warehouse:returns:create';
DELETE FROM permissions WHERE id = '91' AND code = 'production:rework:execute';
DELETE FROM permissions WHERE id = '90' AND code = 'production:steps:manage-abnormal';
DELETE FROM permissions WHERE id = '85' AND code = 'warehouse:inbound:confirm-purchase';
DELETE FROM permissions WHERE id = '80' AND code = 'warehouse:outbound:cancel';
DELETE FROM permissions WHERE id = '79' AND code = 'warehouse:outbound:confirm';
DELETE FROM permissions WHERE id = '75' AND code = 'production:steps:start';
DELETE FROM permissions WHERE id = '74' AND code = 'production:steps:assign';
DELETE FROM permissions WHERE id = '73' AND code = 'warehouse:outbound:create';
DELETE FROM permissions WHERE id = '72' AND code = 'production:materials:allocate';
DELETE FROM permissions WHERE id = '71' AND code = 'production:materials:view';
DELETE FROM permissions WHERE id = '70' AND code = 'production:steps:manage-execution';
DELETE FROM permissions WHERE id = '63' AND code = 'production:steps:report';
DELETE FROM permissions WHERE id = '62' AND code = 'production:batches:transition';
DELETE FROM permissions WHERE id = '61' AND code = 'production:batches:update';
DELETE FROM permissions WHERE id = '60' AND code = 'production:batches:create';
DELETE FROM permissions WHERE id = '58' AND code = 'production:orders:transition';
DELETE FROM permissions WHERE id = '57' AND code = 'production:orders:update';
DELETE FROM permissions WHERE id = '56' AND code = 'production:orders:create';
DELETE FROM permissions WHERE id = '50' AND code = 'product:files:attach';
DELETE FROM permissions WHERE id = '48' AND code = 'product:files:download';
DELETE FROM permissions WHERE id = '47' AND code = 'product:files:upload';
DELETE FROM permissions WHERE id = '46' AND code = 'product:files:view';
DELETE FROM permissions WHERE id = '35' AND code = 'product:routes:delete';
DELETE FROM permissions WHERE id = '34' AND code = 'product:routes:manage-steps';
DELETE FROM permissions WHERE id = '33' AND code = 'product:routes:change-status';
DELETE FROM permissions WHERE id = '32' AND code = 'product:routes:update';
DELETE FROM permissions WHERE id = '31' AND code = 'product:routes:create';
DELETE FROM permissions WHERE id = '29' AND code = 'product:processes:upload-sop';
DELETE FROM permissions WHERE id = '28' AND code = 'product:processes:change-status';
DELETE FROM permissions WHERE id = '27' AND code = 'product:processes:update';
DELETE FROM permissions WHERE id = '26' AND code = 'product:processes:create';
DELETE FROM permissions WHERE id = '24' AND code = 'product:categories:change-status';
DELETE FROM permissions WHERE id = '23' AND code = 'product:categories:update';
DELETE FROM permissions WHERE id = '22' AND code = 'product:categories:create';
DELETE FROM permissions WHERE id = '20' AND code = 'product:products:set-default-route';
DELETE FROM permissions WHERE id = '19' AND code = 'product:products:manage-bom';
DELETE FROM permissions WHERE id = '18' AND code = 'product:products:change-status';
DELETE FROM permissions WHERE id = '17' AND code = 'product:products:update';
DELETE FROM permissions WHERE id = '16' AND code = 'product:products:create';
DELETE FROM permissions WHERE id = '13' AND code = 'system:role:delete';
DELETE FROM permissions WHERE id = '12' AND code = 'system:user:reset-password';
DELETE FROM permissions WHERE id = '9' AND code = 'system:role:assign-permissions';
DELETE FROM permissions WHERE id = '8' AND code = 'system:role:update';
DELETE FROM permissions WHERE id = '7' AND code = 'system:role:create';
DELETE FROM permissions WHERE id = '5' AND code = 'system:user:assign-roles';
DELETE FROM permissions WHERE id = '4' AND code = 'system:user:update';
DELETE FROM permissions WHERE id = '3' AND code = 'system:user:create';
DELETE FROM permissions WHERE id = '175' AND code = 'system:templates:view';
DELETE FROM permissions WHERE id = '172' AND code = 'system:user-candidates:view';
DELETE FROM permissions WHERE id = '170' AND code = 'production:execution-records:view';
DELETE FROM permissions WHERE id = '168' AND code = 'quality:process-inspections:view';
DELETE FROM permissions WHERE id = '166' AND code = 'warehouse:outbound:view';
DELETE FROM permissions WHERE id = '160' AND code = 'warehouse:other-outbounds:view';
DELETE FROM permissions WHERE id = '155' AND code = 'warehouse:other-inbounds:view';
DELETE FROM permissions WHERE id = '152' AND code = 'quality:finished-inspections:view';
DELETE FROM permissions WHERE id = '149' AND code = 'quality:inbound-inspections:view';
DELETE FROM permissions WHERE id = '145' AND code = 'warehouse:receipts:view';
DELETE FROM permissions WHERE id = '139' AND code = 'procurement:orders:view';
DELETE FROM permissions WHERE id = '136' AND code = 'procurement:suppliers:view';
DELETE FROM permissions WHERE id = '126' AND code = 'approval:decide';
DELETE FROM permissions WHERE id = '125' AND code = 'approval:configure';
DELETE FROM permissions WHERE id = '104' AND code = 'warehouse:scraps:view';
DELETE FROM permissions WHERE id = '95' AND code = 'warehouse:stock-checks:view';
DELETE FROM permissions WHERE id = '94' AND code = 'warehouse:returns:view';
DELETE FROM permissions WHERE id = '83' AND code = 'warehouse:inbound:view';
DELETE FROM permissions WHERE id = '82' AND code = 'warehouse:inventory:view';
DELETE FROM permissions WHERE id = '78' AND code = 'production:trace:view';
DELETE FROM permissions WHERE id = '77' AND code = 'production:worker-tasks:view';
DELETE FROM permissions WHERE id = '59' AND code = 'production:tasks:view';
DELETE FROM permissions WHERE id = '55' AND code = 'production:orders:view';
DELETE FROM permissions WHERE id = '30' AND code = 'product:routes:view';
DELETE FROM permissions WHERE id = '25' AND code = 'product:processes:view';
DELETE FROM permissions WHERE id = '21' AND code = 'product:categories:view';
DELETE FROM permissions WHERE id = '15' AND code = 'product:products:view';
DELETE FROM permissions WHERE id = '11' AND code = 'system:log:view';
DELETE FROM permissions WHERE id = '10' AND code = 'system:permission:view';
DELETE FROM permissions WHERE id = '6' AND code = 'system:role:view';
DELETE FROM permissions WHERE id = '2' AND code = 'system:user:view';
DELETE FROM permissions WHERE id = '165' AND code = 'quality:view';
DELETE FROM permissions WHERE id = '135' AND code = 'procurement:view';
DELETE FROM permissions WHERE id = '124' AND code = 'approval:view';
DELETE FROM permissions WHERE id = '93' AND code = 'warehouse:view';
DELETE FROM permissions WHERE id = '54' AND code = 'production:view';
DELETE FROM permissions WHERE id = '53' AND code = 'system:view';
DELETE FROM permissions WHERE id = '14' AND code = 'product:view';
DELETE FROM permissions WHERE id = '1' AND code = 'dashboard:view';

COMMIT;
