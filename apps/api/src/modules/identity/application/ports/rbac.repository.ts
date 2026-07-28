import type {
  CreateSystemRolePayload,
  CreateSystemUserPayload,
  PageResult,
  SystemRoleQuery,
  SystemUserQuery,
  UpdateSystemRolePayload,
  UpdateSystemUserPayload,
  UserOption,
} from '@company/contracts';
import type { AuditLogEntry } from '../../../../common/audit/audit.types.js';
import type {
  IdentityDepartmentOption,
  IdentityPermission,
  IdentityRole,
  IdentityRoleOption,
  IdentityUser,
} from '../../domain/identity.types.js';

export abstract class RbacRepository {
  abstract listUsers(query: SystemUserQuery): Promise<PageResult<IdentityUser>>;
  abstract listDepartmentOptions(): Promise<IdentityDepartmentOption[]>;
  abstract listRoleOptions(): Promise<IdentityRoleOption[]>;
  abstract listActiveUserOptions(): Promise<UserOption[]>;
  abstract listActiveUserOptionsByIds(ids: string[]): Promise<UserOption[]>;
  abstract createUser(
    payload: CreateSystemUserPayload,
    passwordHash: string,
    audit: AuditLogEntry,
  ): Promise<string>;
  abstract updateUser(
    userId: string,
    payload: UpdateSystemUserPayload,
    audit: AuditLogEntry,
  ): Promise<boolean>;
  abstract setUserStatus(userId: string, status: number, audit: AuditLogEntry): Promise<void>;
  abstract resetUserPassword(
    userId: string,
    passwordHash: string,
    audit: AuditLogEntry,
  ): Promise<boolean>;
  abstract setUserRoles(userId: string, roleIds: string[], audit: AuditLogEntry): Promise<void>;
  abstract listRoles(query: SystemRoleQuery): Promise<PageResult<IdentityRole>>;
  abstract createRole(payload: CreateSystemRolePayload, audit: AuditLogEntry): Promise<string>;
  abstract updateRole(
    roleId: string,
    payload: UpdateSystemRolePayload,
    audit: AuditLogEntry,
  ): Promise<boolean>;
  abstract deleteRole(
    roleId: string,
    audit: AuditLogEntry,
  ): Promise<'deleted' | 'not-found' | 'in-use'>;
  abstract getRolePermissionIds(roleId: string): Promise<string[] | null>;
  abstract setRolePermissions(
    roleId: string,
    permissionIds: string[],
    audit: AuditLogEntry,
  ): Promise<void>;
  abstract listPermissions(): Promise<IdentityPermission[]>;
}
