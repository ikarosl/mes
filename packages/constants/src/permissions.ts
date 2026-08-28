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
      authorizeShortBatch: 'production:materials:authorize-short-batch',
      closeRemainingDemands: 'production:materials:close-remaining-demands',
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
      complete: 'production:steps:complete',
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
    scraps: {
      view: 'warehouse:scraps:view',
      create: 'warehouse:scraps:create',
      confirm: 'warehouse:scraps:confirm',
      cancel: 'warehouse:scraps:cancel',
    },
    stockChecks: {
      view: 'warehouse:stock-checks:view',
      create: 'warehouse:stock-checks:create',
      count: 'warehouse:stock-checks:count',
      complete: 'warehouse:stock-checks:complete',
      cancel: 'warehouse:stock-checks:cancel',
    },
  },
} as const;

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
