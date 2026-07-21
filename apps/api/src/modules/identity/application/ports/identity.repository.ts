import type { CreateRoleRequest, CreateUserRequest } from '@company/contracts';
import type { AuditLogEntry } from '../audit.types.js';
import type {
  CredentialUser,
  IdentityPermission,
  IdentityProfile,
  IdentityRole,
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
  abstract createUser(
    payload: CreateUserRequest,
    passwordHash: string,
    audit: AuditLogEntry,
  ): Promise<string>;
  abstract setUserStatus(userId: string, status: number, audit: AuditLogEntry): Promise<void>;
  abstract setUserRoles(userId: string, roleIds: string[], audit: AuditLogEntry): Promise<void>;
  abstract listRoles(): Promise<IdentityRole[]>;
  abstract createRole(payload: CreateRoleRequest, audit: AuditLogEntry): Promise<string>;
  abstract setRolePermissions(
    roleId: string,
    permissionIds: string[],
    audit: AuditLogEntry,
  ): Promise<void>;
  abstract listPermissions(): Promise<IdentityPermission[]>;
}
