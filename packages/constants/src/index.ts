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
    products: { view: 'product:products:view' },
    categories: { view: 'product:categories:view' },
    processes: { view: 'product:processes:view' },
    routes: { view: 'product:routes:view' },
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

export const permissionMatches = (granted: readonly string[], required?: string) => {
  if (!required) return true;
  return granted.some(
    (permission) =>
      permission === '*' ||
      permission === required ||
      (permission.endsWith(':*') && required.startsWith(permission.slice(0, -1))),
  );
};
