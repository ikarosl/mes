export const PERMISSIONS = {
  dashboard: { view: 'dashboard:view' },
  system: {
    view: 'system:view',
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
    files: {
      view: 'product:files:view',
      upload: 'product:files:upload',
      download: 'product:files:download',
      delete: 'product:files:delete',
      attach: 'product:files:attach',
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
    orders: {
      view: 'production:orders:view',
      create: 'production:orders:create',
      update: 'production:orders:update',
      transition: 'production:orders:transition',
    },
    tasks: { view: 'production:tasks:view' },
    workerTasks: { view: 'production:worker-tasks:view' },
    trace: { view: 'production:trace:view' },
    materials: {
      view: 'production:materials:view',
      allocate: 'production:materials:allocate',
      outbound: 'production:materials:outbound',
      confirmOutbound: 'production:materials:outbound-confirm',
      cancelOutbound: 'production:materials:outbound-cancel',
    },
    inventory: { view: 'production:inventory:view' },
    inbounds: {
      view: 'production:inbounds:view',
      create: 'production:inbounds:create',
      confirm: 'production:inbounds:confirm',
      cancel: 'production:inbounds:cancel',
    },
    batches: {
      create: 'production:batches:create',
      update: 'production:batches:update',
      transition: 'production:batches:transition',
    },
    steps: {
      report: 'production:steps:report',
      manageExecution: 'production:steps:manage-execution',
      manageAbnormal: 'production:steps:manage-abnormal',
      assign: 'production:steps:assign',
      start: 'production:steps:start',
    },
    rework: { execute: 'production:rework:execute' },
  },
  warehouse: {
    view: 'warehouse:view',
    inventory: { view: 'warehouse:inventory:view' },
    inbound: { view: 'warehouse:inbound:view' },
    outbound: { view: 'warehouse:outbound:view' },
    returns: {
      view: 'warehouse:returns:view',
      create: 'warehouse:returns:create',
      confirm: 'warehouse:returns:confirm',
      cancel: 'warehouse:returns:cancel',
    },
    scraps: { view: 'warehouse:scraps:view' },
    stockChecks: {
      view: 'warehouse:stock-checks:view',
      create: 'warehouse:stock-checks:create',
      count: 'warehouse:stock-checks:count',
      complete: 'warehouse:stock-checks:complete',
      cancel: 'warehouse:stock-checks:cancel',
    },
  },
} as const;

export const SYSTEM_STATUS = {
  disabled: 0,
  enabled: 1,
} as const;

export const PRODUCT_ITEM_KINDS = ['material', 'semi_finished', 'finished_product'] as const;
export const PRODUCT_ACQUIRE_METHODS = ['self_made', 'outsourced', 'purchased'] as const;
export const PROCESS_ROUTE_STATUSES = ['draft', 'enabled', 'disabled', 'archived'] as const;
export const TECHNICAL_FILE_STORAGE_PROVIDERS = ['s3'] as const;
export const TECHNICAL_FILE_TYPES = ['sop'] as const;
export const PERMISSION_TYPES = ['menu', 'page', 'button', 'api'] as const;
export const OPERATION_RESULTS = ['success', 'failed'] as const;

export const CONCURRENCY_ERROR_CODES = {
  concurrentModification: 'CONCURRENT_MODIFICATION',
  idempotencyConflict: 'IDEMPOTENCY_CONFLICT',
} as const;

/** 未启用幂等的端点收到意外 `Idempotency-Key` 头时的拒绝错误码。 */
export const IDEMPOTENCY_NOT_SUPPORTED = 'IDEMPOTENCY_NOT_SUPPORTED';

/**
 * 幂等存储基础设施错误码（`IdempotencyStorageError` 的两类，见 common/idempotency/idempotency.errors.ts）：
 * - 可重试：锁等待/死锁/连接中断等瞬态存储失败，客户端应保留原键重试；
 * - 结果损坏：已保存的幂等结果无法反序列化，确定性失败，不得重试、不得自动换新键，需人工处理。
 */
export const IDEMPOTENCY_STORAGE_RETRYABLE = 'IDEMPOTENCY_STORAGE_RETRYABLE';
export const IDEMPOTENCY_RESULT_CORRUPT = 'IDEMPOTENCY_RESULT_CORRUPT';

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
export const BATCH_STEP_STATUSES = ['pending', 'assigned', 'doing', 'completed'] as const;
export const BATCH_STEP_STATUS_LABELS = {
  pending: '待派工',
  assigned: '已派工',
  doing: '进行中',
  completed: '已完成',
} as const;
export const BATCH_STEP_REPORT_TYPES = ['normal', 'reversal'] as const;
export const BATCH_STEP_REPORT_TYPE_LABELS = {
  normal: '普通报工',
  reversal: '冲销事实',
} as const;
export const BATCH_STEP_ABNORMAL_REVIEW_STATUSES = [
  'pending_review',
  'approved',
  'rejected',
  'cancelled',
] as const;
export const BATCH_STEP_ABNORMAL_DISPOSITION_TYPES = ['rework', 'scrap'] as const;
export const BATCH_STEP_ABNORMAL_REVIEW_STATUS_LABELS = {
  pending_review: '待处置',
  approved: '已批准',
  rejected: '已驳回',
  cancelled: '已取消',
} as const;
export const REWORK_STATUSES = ['pending', 'doing', 'completed', 'cancelled'] as const;
export const REWORK_STATUS_LABELS = {
  pending: '待返工',
  doing: '返工中',
  completed: '已完成',
  cancelled: '已取消',
} as const;
export const PRODUCTION_EXECUTION_COMPLETION_BLOCKERS = [
  'batch_not_doing',
  'no_required_reporting_step',
  'required_step_incomplete',
  'final_step_quantity_insufficient',
] as const;
export const PRODUCTION_EXECUTION_COMPLETION_BLOCKER_LABELS = {
  batch_not_doing: '批次尚未进入生产执行状态',
  no_required_reporting_step: '批次没有必报工工序',
  required_step_incomplete: '仍有必报工工序未完成',
  final_step_quantity_insufficient: '最后一道必报工工序的有效正常数量尚未达到计划数量',
} as const;
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
export const DEMAND_TYPES = ['normal', 'manual_additional', 'scrap_supplement'] as const;
export const DEMAND_TYPE = {
  normal: DEMAND_TYPES[0],
  manualAdditional: DEMAND_TYPES[1],
  scrapSupplement: DEMAND_TYPES[2],
} as const;
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
export const ALLOCATION_STATUS_LABELS = {
  active: '有效',
  released: '已释放',
  cancelled: '已取消',
  frozen: '已冻结',
  abnormal: '异常',
} as const;

export const MATERIAL_DEMAND_PROGRESS_LABELS = {
  pending_allocation: '待分配',
  partially_allocated: '部分分配',
  allocated: '已分配',
  shortage: '缺料',
  partially_outbound: '部分出库',
  outbound: '已出库',
  unknown: '未知',
} as const;

export const OUTBOUND_ORDER_STATUS_LABELS = {
  pending_picking: '待出库',
  picked: '已拣货',
  partially_outbound: '部分出库',
  completed: '已出库',
  cancelled: '已取消',
} as const;
export const RETURN_ORDER_STATUSES = ['pending', 'returned', 'scrapped', 'cancelled'] as const;
export const RETURN_ORDER_STATUS_LABELS = {
  pending: '待退料',
  returned: '已入库',
  scrapped: '已报废',
  cancelled: '已取消',
} as const;
export const SCRAP_SCENES = [
  'warehouse_allocated',
  'return_after_outbound',
  'production_consumed',
  'in_stock',
] as const;
export const SCRAP_STATUSES = ['pending', 'confirmed', 'cancelled'] as const;
export const STOCK_CHECK_STATUSES = ['pending', 'counting', 'completed', 'cancelled'] as const;
export const STOCK_CHECK_RESULTS = ['surplus', 'shortage', 'matched'] as const;
export const STOCK_CHECK_STATUS_LABELS = {
  pending: '待盘点',
  counting: '盘点中',
  completed: '已完成',
  cancelled: '已取消',
} as const;
export const STOCK_CHECK_RESULT_LABELS = {
  surplus: '盘盈',
  shortage: '盘亏',
  matched: '一致',
} as const;
export const INSPECTION_TYPES = ['process', 'final'] as const;
export const INSPECTION_RESULTS = ['pending', 'passed', 'failed', 'conditional'] as const;
export const REWORK_RESULTS = ['pending', 'passed', 'failed'] as const;
export const FINISHED_FLOW_TYPES = [
  'warehouse_inbound',
  'quality_release',
  'warehouse_outbound',
  'other',
] as const;
export const FINISHED_FLOW_STATUSES = ['confirmed', 'cancelled'] as const;

/**
 * 权限匹配：required 为单个权限或任意之一权限集（any-of，跨页面 /options 授权用）。
 * 未提供 required 视为放行；空数组视为拒绝一切。
 */
export const permissionMatches = (
  granted: readonly string[],
  required?: string | readonly string[],
) => {
  if (!required) return true;
  const requirements = Array.isArray(required) ? required : [required];
  return requirements.some((requirement) =>
    granted.some(
      (permission) =>
        permission === '*' ||
        permission === requirement ||
        (permission.endsWith(':*') && requirement.startsWith(permission.slice(0, -1))),
    ),
  );
};
