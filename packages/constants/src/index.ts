export const PERMISSIONS = {
  dashboard: { view: 'dashboard:view' },
  system: {
    users: {
      view: 'system:user:view',
      create: 'system:user:create',
      update: 'system:user:update',
      resetPassword: 'system:user:reset-password',
      assignRoles: 'system:user:assign-roles',
    },
    roles: {
      view: 'system:role:view',
      create: 'system:role:create',
      update: 'system:role:update',
      delete: 'system:role:delete',
      assignPermissions: 'system:role:assign-permissions',
    },
    permissions: { view: 'system:permission:view' },
    logs: { view: 'system:log:view' },
  },
  product: {
    view: 'product:view',
    products: {
      view: 'product:products:view',
      create: 'product:products:create',
      update: 'product:products:update',
      changeStatus: 'product:products:change-status',
      manageBom: 'product:products:manage-bom',
      setDefaultRoute: 'product:products:set-default-route',
    },
    categories: {
      view: 'product:categories:view',
      create: 'product:categories:create',
      update: 'product:categories:update',
      changeStatus: 'product:categories:change-status',
    },
    processes: {
      view: 'product:processes:view',
      create: 'product:processes:create',
      update: 'product:processes:update',
      changeStatus: 'product:processes:change-status',
      uploadSop: 'product:processes:upload-sop',
    },
    routes: {
      view: 'product:routes:view',
      create: 'product:routes:create',
      update: 'product:routes:update',
      changeStatus: 'product:routes:change-status',
      manageSteps: 'product:routes:manage-steps',
      delete: 'product:routes:delete',
    },
  },
  production: {
    view: 'production:view',
    orders: { view: 'production:orders:view' },
    tasks: { view: 'production:tasks:view' },
  },
  warehouse: {
    view: 'warehouse:view',
    inventory: { view: 'warehouse:inventory:view' },
    inbound: { view: 'warehouse:inbound:view' },
    outbound: { view: 'warehouse:outbound:view' },
    returns: { view: 'warehouse:returns:view' },
    scraps: { view: 'warehouse:scraps:view' },
    stockChecks: { view: 'warehouse:stock-checks:view' },
  },
} as const;

export const SYSTEM_STATUS = {
  disabled: 0,
  enabled: 1,
} as const;

export const PRODUCT_ITEM_KINDS = ['material', 'semi_finished', 'finished_product'] as const;
export const PRODUCT_ACQUIRE_METHODS = ['self_made', 'outsourced', 'purchased'] as const;
export const PROCESS_ROUTE_STATUSES = ['draft', 'enabled', 'disabled', 'archived'] as const;
export const PERMISSION_TYPES = ['menu', 'page', 'button', 'api'] as const;
export const OPERATION_RESULTS = ['success', 'failed'] as const;

export const WORK_ORDER_STATUSES = [
  'draft',
  'released',
  'doing',
  'completed',
  'cancelled',
  'closed',
] as const;
export const PRODUCTION_BATCH_STATUSES = [
  'pending',
  'material_pending',
  'material_assigned',
  'material_outbound',
  'doing',
  'completed',
  'cancelled',
] as const;
export const BATCH_STEP_STATUSES = [
  'pending',
  'assigned',
  'doing',
  'completed',
  'abnormal',
] as const;
export const INVENTORY_SOURCE_TYPES = [
  'self_made',
  'purchased',
  'outsourced',
  'return_inbound',
  'stock_check_generated',
  'other',
] as const;
export const INVENTORY_BATCH_STATUSES = ['available', 'frozen', 'disabled'] as const;
export const STOCK_STATUSES = ['available', 'pending_inspection', 'frozen', 'defective'] as const;
export const INVENTORY_TRANSACTION_TYPES = [
  'purchase_inbound',
  'production_inbound',
  'outsourced_inbound',
  'production_material_outbound',
  'sales_outbound',
  'material_return_inbound',
  'scrap_outbound',
  'stock_check_adjustment',
  'status_transfer_in',
  'status_transfer_out',
] as const;
export const INVENTORY_REFERENCE_TYPES = [
  'inbound_detail',
  'outbound_detail',
  'return_detail',
  'scrap',
  'stock_check_detail',
  'inspection_record',
  'manual',
] as const;
export const INBOUND_ORDER_STATUSES = ['pending', 'completed', 'cancelled'] as const;
export const DEMAND_BUSINESS_STATUSES = [
  'active',
  'cancelled',
  'closed',
  'frozen',
  'abnormal',
] as const;
export const ALLOCATION_STATUSES = [
  'active',
  'released',
  'cancelled',
  'frozen',
  'abnormal',
] as const;
export const OUTBOUND_ORDER_STATUSES = [
  'pending_picking',
  'picked',
  'partially_outbound',
  'completed',
  'cancelled',
] as const;
export const RETURN_ORDER_STATUSES = ['pending', 'returned', 'scrapped', 'cancelled'] as const;
export const SCRAP_SCENES = [
  'warehouse_allocated',
  'return_after_outbound',
  'production_consumed',
  'in_stock',
] as const;
export const SCRAP_STATUSES = ['pending', 'confirmed', 'cancelled'] as const;
export const STOCK_CHECK_STATUSES = ['pending', 'counting', 'completed', 'cancelled'] as const;
export const STOCK_CHECK_RESULTS = ['surplus', 'shortage', 'matched'] as const;
export const INSPECTION_TYPES = ['process', 'final'] as const;
export const INSPECTION_RESULTS = ['pending', 'passed', 'failed', 'conditional'] as const;
export const REWORK_STATUSES = ['pending', 'doing', 'completed', 'cancelled'] as const;
export const REWORK_RESULTS = ['pending', 'passed', 'failed'] as const;
export const FINISHED_FLOW_TYPES = [
  'warehouse_inbound',
  'quality_release',
  'warehouse_outbound',
  'other',
] as const;
export const FINISHED_FLOW_STATUSES = ['confirmed', 'cancelled'] as const;

export const permissionMatches = (granted: readonly string[], required?: string) => {
  if (!required) return true;
  return granted.some(
    (permission) =>
      permission === '*' ||
      permission === required ||
      (permission.endsWith(':*') && required.startsWith(permission.slice(0, -1))),
  );
};
