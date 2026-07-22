import type {
  CreateSystemRolePayload,
  CreateSystemUserPayload,
  UpdateSystemRolePayload,
  UpdateSystemUserPayload,
} from '@company/contracts';
import type { AuditLogEntry } from '../audit.types.js';
import type {
  CredentialUser,
  IdentityDepartmentOption,
  IdentityPermission,
  IdentityProfile,
  IdentityRole,
  IdentityRoleOption,
  IdentityUser,
  RefreshTokenRecord,
} from '../../domain/identity.types.js';

export abstract class IdentityRepository {
  abstract findCredentials(username: string): Promise<CredentialUser | null>;
  abstract findProfile(userId: string): Promise<IdentityProfile | null>;
  abstract touchLastLogin(userId: string): Promise<void>;
  abstract saveRefreshToken(token: RefreshTokenRecord): Promise<void>;
  abstract rotateRefreshToken(
    oldJti: string,
    userId: string,
    replacement: RefreshTokenRecord,
  ): Promise<boolean>;
  abstract revokeRefreshToken(jti: string): Promise<void>;
  abstract listUsers(): Promise<IdentityUser[]>;
  abstract listDepartmentOptions(): Promise<IdentityDepartmentOption[]>;
  abstract listRoleOptions(): Promise<IdentityRoleOption[]>;
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
  abstract listRoles(): Promise<IdentityRole[]>;
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
