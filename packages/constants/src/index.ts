export const PERMISSIONS = {
  dashboard: { view: 'dashboard:view' },
  system: {
    users: {
      view: 'system:user:view',
      create: 'system:user:create',
      update: 'system:user:update',
      assignRoles: 'system:user:assign-roles',
    },
    roles: {
      view: 'system:role:view',
      create: 'system:role:create',
      update: 'system:role:update',
      assignPermissions: 'system:role:assign-permissions',
    },
    permissions: { view: 'system:permission:view' },
    logs: { view: 'system:log:view' },
  },
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
