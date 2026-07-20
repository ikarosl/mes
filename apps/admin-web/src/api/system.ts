import {
  SYSTEM_API,
  type CreateRoleRequest,
  type CreateUserRequest,
  type PermissionListItem,
  type RoleListItem,
  type UserListItem,
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
  users: () => request<UserListItem[]>({ url: SYSTEM_API.users }),
  createUser: (data: CreateUserRequest) =>
    request<{ id: string }>({ url: SYSTEM_API.users, method: 'POST', data }),
  setUserStatus: (id: string, status: number) =>
    request<void>({ url: `${SYSTEM_API.users}/${id}/status`, method: 'PATCH', data: { status } }),
  setUserRoles: (id: string, roleIds: string[]) =>
    request<void>({ url: `${SYSTEM_API.users}/${id}/roles`, method: 'PUT', data: { roleIds } }),
  roles: () => request<RoleListItem[]>({ url: SYSTEM_API.roles }),
  createRole: (data: CreateRoleRequest) =>
    request<{ id: string }>({ url: SYSTEM_API.roles, method: 'POST', data }),
  setRolePermissions: (id: string, permissionIds: string[]) =>
    request<void>({
      url: `${SYSTEM_API.roles}/${id}/permissions`,
      method: 'PUT',
      data: { permissionIds },
    }),
  permissions: () => request<PermissionListItem[]>({ url: SYSTEM_API.permissions }),
  logs: () => request<Record<string, unknown>[]>({ url: SYSTEM_API.logs }),
};
