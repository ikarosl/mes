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

/**
 * 写操作失败结果。业务失败（输入不合法、目标不存在、引用无效、自然键冲突）不作为异常抛出，
 * 由 presentation 层统一映射为 HTTP 状态和错误信封；数据库错误在 infrastructure 内映射。
 */
export type RbacWriteFailure =
  | { status: 'invalid-input'; message: string }
  | { status: 'not-found' }
  | { status: 'invalid-reference'; message: string }
  | { status: 'conflict'; message: string };

export type RbacWriteResult<T = void> = { status: 'success'; value: T } | RbacWriteFailure;

export abstract class RbacRepository {
  abstract listUsers(query: SystemUserQuery): Promise<PageResult<IdentityUser>>;
  abstract listDepartmentOptions(): Promise<IdentityDepartmentOption[]>;
  abstract listRoleOptions(): Promise<IdentityRoleOption[]>;
  abstract listActiveUserOptions(): Promise<UserOption[]>;
  abstract listActiveUserOptionsByIds(ids: string[]): Promise<UserOption[]>;
  abstract listUserReferencesByIds(ids: string[]): Promise<UserOption[]>;
  abstract createUser(
    payload: CreateSystemUserPayload,
    passwordHash: string,
    audit: AuditLogEntry,
  ): Promise<RbacWriteResult<string>>;
  abstract updateUser(
    userId: string,
    payload: UpdateSystemUserPayload,
    audit: AuditLogEntry,
  ): Promise<RbacWriteResult>;
  abstract setUserStatus(
    userId: string,
    status: number,
    audit: AuditLogEntry,
  ): Promise<RbacWriteResult>;
  abstract resetUserPassword(
    userId: string,
    passwordHash: string,
    audit: AuditLogEntry,
  ): Promise<RbacWriteResult>;
  abstract setUserRoles(
    userId: string,
    roleIds: string[],
    audit: AuditLogEntry,
  ): Promise<RbacWriteResult>;
  abstract listRoles(query: SystemRoleQuery): Promise<PageResult<IdentityRole>>;
  abstract createRole(
    payload: CreateSystemRolePayload,
    audit: AuditLogEntry,
  ): Promise<RbacWriteResult<string>>;
  abstract updateRole(
    roleId: string,
    payload: UpdateSystemRolePayload,
    audit: AuditLogEntry,
  ): Promise<RbacWriteResult>;
  abstract deleteRole(roleId: string, audit: AuditLogEntry): Promise<RbacWriteResult>;
  abstract getRolePermissionIds(roleId: string): Promise<string[] | null>;
  abstract setRolePermissions(
    roleId: string,
    permissionIds: string[],
    audit: AuditLogEntry,
  ): Promise<RbacWriteResult>;
  abstract listPermissions(): Promise<IdentityPermission[]>;
}
