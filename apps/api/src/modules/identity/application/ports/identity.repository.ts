import type { PoolConnection } from 'mysql2/promise';
import type { CreateRoleRequest, CreateUserRequest } from '@company/contracts';
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
  abstract createUser(payload: CreateUserRequest, passwordHash: string): Promise<string>;
  abstract setUserStatus(userId: string, status: number): Promise<void>;
  abstract setUserRoles(userId: string, roleIds: string[]): Promise<void>;
  abstract listRoles(): Promise<IdentityRole[]>;
  abstract createRole(payload: CreateRoleRequest): Promise<string>;
  abstract setRolePermissions(roleId: string, permissionIds: string[]): Promise<void>;
  abstract listPermissions(): Promise<IdentityPermission[]>;
  abstract listLogs(): Promise<Record<string, unknown>[]>;
  abstract writeLog(entry: {
    logType: string;
    module: string;
    action: string;
    userId?: string | null;
    result: string;
    ip?: string | null;
    remark?: string | null;
  }): Promise<void>;
  abstract transaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T>;
}
