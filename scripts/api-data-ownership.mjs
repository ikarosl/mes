/**
 * SQL 对象的唯一所有者登记。历史 migration 中已删除的表仍登记，以禁止跨模块重新访问。
 * 这里不创建 schema；业务语义由各模块数据库文档所有，结构只通过追加 migration 改变。
 */
export const API_DATA_OWNERSHIP = Object.freeze({
  approval: Object.freeze([
    'approval_flow_definitions',
    'approval_flow_versions',
    'approval_flow_steps',
    'approval_instances',
    'approval_instance_steps',
    'approval_tasks',
    'approval_actions',
  ]),
  identity: Object.freeze([
    'departments',
    'users',
    'roles',
    'permissions',
    'user_roles',
    'role_permissions',
    'refresh_tokens',
  ]),
  product: Object.freeze([
    'product_categories',
    'products',
    'materials',
    'material_variants',
    'product_materials',
    'technical_files',
    'process_steps',
    'process_routes',
    'process_route_steps',
    'route_step_materials',
  ]),
  production: Object.freeze([
    'work_orders',
    'work_order_material_versions',
    'production_batches',
    'batch_step_records',
    'batch_step_reports',
    'batch_step_abnormal_dispositions',
    'rework_records',
    'batch_step_scrap_records',
    'batch_step_scrap_reproduction_authorization',
    'production_scrap_supplement_plan',
    'production_scrap_supplement_plan_line',
    'production_material_supplement',
    'production_material_supplement_detail',
    'production_material_requirement_basis',
    'production_manual_demand_addition',
    'production_item_demand',
    'production_item_allocation',
    'production_short_batch_authorization',
    'production_short_batch_authorization_detail',
    'item_scrap',
    'inbound_order',
    'inbound_detail',
    'outbound_order',
    'outbound_detail',
    'return_order',
    'return_detail',
    'stock_check_order',
    'stock_check_detail',
    'item_batch',
    'inventory_transaction',
    'inventory_batch_balance',
    'inventory_item_balance', // Retired projection; retain ownership for immutable historical migrations.
    'inventory_material_variant_balance',
  ]),
  'platform-audit': Object.freeze(['operation_logs']),
  'platform-idempotency': Object.freeze(['http_idempotency_records']),
  database: Object.freeze(['_schema_migrations']),
});

/** 展示查询的正式只读依赖；不授予业务校验、跨模块写入或深层 import 权限。 */
export const API_DISPLAY_READ_ACCESS = Object.freeze([
  {
    directory: 'apps/api/src/modules/production/infrastructure/queries/',
    tables: { materials: ['id', 'material_name'] },
  },
]);
