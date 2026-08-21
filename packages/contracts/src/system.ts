import type { PageQuery, PermissionType, OperationResult } from './common.js';

export interface UserListItem {
  id: string;
  username: string;
  displayName: string;
  departmentName: string | null;
  status: number;
  roles: string[];
  lastLoginAt: string | null;
}

export interface RoleListItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  status: number;
  permissionIds: string[];
}

export interface PermissionListItem {
  id: string;
  parentId: string | null;
  name: string;
  code: string;
  type: PermissionType;
  routePath: string | null;
  status: number;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  displayName: string;
  departmentId?: string | null;
  roleIds: string[];
}

export interface CreateRoleRequest {
  name: string;
  code: string;
  description?: string | null;
}

export interface SystemUserListItem {
  id: string;
  username: string;
  displayName: string;
  departmentId: string | null;
  departmentName: string | null;
  email: string | null;
  mobile: string | null;
  roleIds: string[];
  roles: string[];
  status: number;
  lastLoginAt: string | null;
}

export interface SystemRoleListItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  permissionCount: number;
  userCount: number;
  status: number;
  updatedAt: string | null;
}

export interface SystemPermissionListItem {
  id: string;
  parentId: string | null;
  name: string;
  code: string;
  type: PermissionType;
  routePath: string | null;
  apiMethod: string | null;
  apiPath: string | null;
  status: number;
}

export interface SystemPermissionTreeNode extends SystemPermissionListItem {
  children: SystemPermissionTreeNode[];
}

export interface SystemRolePermissionDetail {
  roleId: string;
  permissionIds: string[];
}

export interface OperationLogListItem {
  id: string;
  logType: string;
  module: string;
  action: string;
  userId: string | null;
  username: string | null;
  targetId: string | null;
  targetType: string | null;
  targetIds: unknown;
  businessKey: string | null;
  result: OperationResult;
  requestId: string | null;
  httpMethod: string | null;
  route: string | null;
  httpStatus: number | null;
  durationMs: number | null;
  requestData: unknown;
  beforeData: unknown;
  afterData: unknown;
  ip: string | null;
  userAgent: string | null;
  errorCode: string | null;
  remark: string | null;
  createdAt: string;
}

export interface SystemDepartmentOption {
  id: string;
  parentId: string;
  name: string;
  code: string;
}

export interface SystemRoleOption {
  id: string;
  name: string;
  code: string;
}

export interface SystemUserQuery extends PageQuery {
  keyword?: string;
  username?: string;
  displayName?: string;
  roleId?: string;
  status?: number;
}

export interface SystemRoleQuery extends PageQuery {
  keyword?: string;
  name?: string;
  code?: string;
  status?: number;
}

export interface CreateSystemUserPayload {
  username: string;
  password: string;
  displayName: string;
  departmentId?: string | null;
  email?: string | null;
  mobile?: string | null;
  status?: number | boolean;
  roleIds?: string[];
}

export interface UpdateSystemUserPayload {
  username?: string;
  displayName?: string;
  departmentId?: string | null;
  email?: string | null;
  mobile?: string | null;
}

export interface UpdateSystemUserStatusPayload {
  status: number | boolean;
}

export interface ResetSystemUserPasswordPayload {
  password: string;
}

export interface AssignSystemUserRolesPayload {
  roleIds: string[];
}

export interface CreateSystemRolePayload {
  name: string;
  code: string;
  description?: string | null;
  status?: number | boolean;
}

export interface UpdateSystemRolePayload {
  name?: string;
  code?: string;
  description?: string | null;
  status?: number | boolean;
}

export interface AssignSystemRolePermissionsPayload {
  permissionIds: string[];
}

export interface OperationLogQuery extends PageQuery {
  keyword?: string;
  logType?: string;
  module?: string;
  result?: OperationResult;
  userId?: string;
  requestId?: string;
  targetType?: string;
  targetId?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
}

export interface UserOption {
  id: string;
  displayName: string;
}

export const OPERATION_LOG_MODULE_OPTIONS = [
  { label: '认证登录', value: 'auth' },
  { label: '系统管理', value: 'system' },
  { label: '产品资料', value: 'product' },
  { label: '生产管理', value: 'production' },
  { label: '生产物料分配', value: 'material-allocation' },
  { label: '仓储管理', value: 'warehouse' },
  { label: '质量管理', value: 'quality' },
  { label: '未知模块', value: 'unknown' },
] as const;

export const SYSTEM_API = {
  users: '/system/users',
  departmentOptions: '/system/departments/options',
  roleOptions: '/system/roles/options',
  roles: '/system/roles',
  permissions: '/system/permissions',
  logs: '/system/logs',
} as const;
