import {
  SYSTEM_API,
  type AssignSystemRolePermissionsPayload,
  type AssignSystemUserRolesPayload,
  type CreateSystemRolePayload,
  type CreateSystemUserPayload,
  type OperationLogListItem,
  type OperationLogQuery,
  type PageResult,
  type ResetSystemUserPasswordPayload,
  type SystemDepartmentOption,
  type SystemPermissionListItem,
  type SystemRoleListItem,
  type SystemRoleQuery,
  type SystemRoleOption,
  type SystemRolePermissionDetail,
  type SystemUserListItem,
  type SystemUserQuery,
  type UpdateSystemRolePayload,
  type UpdateSystemUserPayload,
  type UpdateSystemUserStatusPayload,
} from '@company/contracts';
import { toRequestError, type RetryRequestConfig } from '@company/request';
import { httpClient } from './http';

const request = async <T>(config: RetryRequestConfig) => {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
};

export const systemApi = {
  users: (params: SystemUserQuery) =>
    request<PageResult<SystemUserListItem>>({ url: SYSTEM_API.users, params }),
  // /options 契约：best-effort，403/失败只影响该项下拉，不触发全局错误处理
  departmentOptions: () =>
    request<SystemDepartmentOption[]>({
      url: SYSTEM_API.departmentOptions,
      skipErrorHandling: true,
    }),
  roleOptions: () =>
    request<SystemRoleOption[]>({ url: SYSTEM_API.roleOptions, skipErrorHandling: true }),
  createUser: (data: CreateSystemUserPayload) =>
    request<{ id: string }>({ url: SYSTEM_API.users, method: 'POST', data }),
  updateUser: (id: string, data: UpdateSystemUserPayload) =>
    request<void>({ url: `${SYSTEM_API.users}/${id}`, method: 'PATCH', data }),
  setUserStatus: (id: string, data: UpdateSystemUserStatusPayload) =>
    request<void>({ url: `${SYSTEM_API.users}/${id}/status`, method: 'PATCH', data }),
  resetUserPassword: (id: string, data: ResetSystemUserPasswordPayload) =>
    request<void>({ url: `${SYSTEM_API.users}/${id}/password`, method: 'PATCH', data }),
  setUserRoles: (id: string, data: AssignSystemUserRolesPayload) =>
    request<void>({ url: `${SYSTEM_API.users}/${id}/roles`, method: 'PUT', data }),
  roles: (params: SystemRoleQuery) =>
    request<PageResult<SystemRoleListItem>>({ url: SYSTEM_API.roles, params }),
  createRole: (data: CreateSystemRolePayload) =>
    request<{ id: string }>({ url: SYSTEM_API.roles, method: 'POST', data }),
  updateRole: (id: string, data: UpdateSystemRolePayload) =>
    request<void>({ url: `${SYSTEM_API.roles}/${id}`, method: 'PATCH', data }),
  deleteRole: (id: string) => request<void>({ url: `${SYSTEM_API.roles}/${id}`, method: 'DELETE' }),
  rolePermissions: (id: string) =>
    request<SystemRolePermissionDetail>({ url: `${SYSTEM_API.roles}/${id}/permissions` }),
  setRolePermissions: (id: string, data: AssignSystemRolePermissionsPayload) =>
    request<void>({ url: `${SYSTEM_API.roles}/${id}/permissions`, method: 'PUT', data }),
  permissions: () => request<SystemPermissionListItem[]>({ url: SYSTEM_API.permissions }),
  logs: (params: OperationLogQuery) =>
    request<PageResult<OperationLogListItem>>({ url: SYSTEM_API.logs, params }),
};
