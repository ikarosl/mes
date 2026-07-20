export type AuthTokenKind = 'access' | 'refresh';

export interface LoginRequest {
  username: string;
  password: string;
}
export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  permissions: string[];
}
export interface TokenResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  user: UserProfile;
}
export interface JwtClaims {
  sub: string;
  username: string;
  kind: AuthTokenKind;
  exp: number;
  iat: number;
  jti?: string;
}
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
  type: string;
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
export const AUTH_API = {
  login: '/auth/login',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  me: '/auth/me',
} as const;
export const SYSTEM_API = {
  users: '/system/users',
  roles: '/system/roles',
  permissions: '/system/permissions',
  logs: '/system/logs',
} as const;
