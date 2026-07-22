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
  type SystemRoleOption,
  type SystemRolePermissionDetail,
  type SystemUserListItem,
  type UpdateSystemRolePayload,
  type UpdateSystemUserPayload,
  type UpdateSystemUserStatusPayload,
} from '@company/contracts';
import { toRequestError } from '@company/request';
import { httpClient } from './http';

const request = async <T>(config: Parameters<typeof httpClient.request<T>>[0]) => {
  try {
    return (await httpClient.request<T>(config)).data;
  } catch (error) {
    throw toRequestError(error);
  }
};

export const systemApi = {
  users: () => request<SystemUserListItem[]>({ url: SYSTEM_API.users }),
  departmentOptions: () => request<SystemDepartmentOption[]>({ url: SYSTEM_API.departmentOptions }),
  roleOptions: () => request<SystemRoleOption[]>({ url: SYSTEM_API.roleOptions }),
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
  roles: () => request<SystemRoleListItem[]>({ url: SYSTEM_API.roles }),
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
