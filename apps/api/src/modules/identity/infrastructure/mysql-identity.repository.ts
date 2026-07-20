import { Inject, Injectable } from '@nestjs/common';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CreateRoleRequest, CreateUserRequest } from '@company/contracts';
import { withTransaction } from '@company/database';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { IdentityRepository } from '../application/ports/identity.repository.js';
import type {
  CredentialUser,
  IdentityPermission,
  IdentityProfile,
  IdentityRole,
  IdentityUser,
  RefreshTokenRecord,
} from '../domain/identity.types.js';

type UserRow = RowDataPacket & {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
};
@Injectable()
export class MysqlIdentityRepository implements IdentityRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}
  async findCredentials(username: string): Promise<CredentialUser | null> {
    const [rows] = await this.pool.query<UserRow[]>(
      `SELECT id, username, password_hash, display_name FROM users WHERE username=? AND status=1 AND deleted_at IS NULL LIMIT 1`,
      [username],
    );
    const row = rows[0];
    return row
      ? {
          id: String(row.id),
          username: row.username,
          passwordHash: row.password_hash,
          displayName: row.display_name,
        }
      : null;
  }
  async findProfile(userId: string): Promise<IdentityProfile | null> {
    const [rows] = await this.pool.query<UserRow[]>(
      `SELECT id, username, password_hash, display_name FROM users WHERE id=? AND status=1 AND deleted_at IS NULL LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    if (!row) return null;
    const [roleRows] = await this.pool.query<(RowDataPacket & { code: string })[]>(
      `SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? AND r.status=1 AND r.deleted_at IS NULL ORDER BY r.code`,
      [userId],
    );
    const [permissionRows] = await this.pool.query<(RowDataPacket & { code: string })[]>(
      `SELECT DISTINCT p.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=? AND r.status=1 AND r.deleted_at IS NULL AND p.status=1 AND p.deleted_at IS NULL ORDER BY p.code`,
      [userId],
    );
    return {
      id: String(row.id),
      username: row.username,
      displayName: row.display_name,
      roles: roleRows.map((item) => item.code),
      permissions: permissionRows.map((item) => item.code),
    };
  }
  async touchLastLogin(userId: string) {
    await this.pool.execute('UPDATE users SET last_login_at=NOW() WHERE id=?', [userId]);
  }
  async saveRefreshToken(token: RefreshTokenRecord) {
    await this.pool.execute('INSERT INTO refresh_tokens (user_id,jti,expires_at) VALUES (?,?,?)', [
      token.userId,
      token.jti,
      token.expiresAt,
    ]);
  }
  async rotateRefreshToken(oldJti: string, userId: string, replacement: RefreshTokenRecord) {
    return withTransaction(this.pool, async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        'UPDATE refresh_tokens SET revoked_at=NOW(), replaced_by_jti=? WHERE jti=? AND user_id=? AND revoked_at IS NULL AND expires_at>NOW()',
        [replacement.jti, oldJti, userId],
      );
      if (result.affectedRows !== 1) return false;
      await connection.execute(
        'INSERT INTO refresh_tokens (user_id,jti,expires_at) VALUES (?,?,?)',
        [replacement.userId, replacement.jti, replacement.expiresAt],
      );
      return true;
    });
  }
  async revokeRefreshToken(jti: string) {
    await this.pool.execute(
      'UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,NOW()) WHERE jti=?',
      [jti],
    );
  }
  async listUsers(): Promise<IdentityUser[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        username: string;
        display_name: string;
        department_name: string | null;
        status: number;
        last_login_at: Date | null;
        roles: string | null;
      })[]
    >(
      `SELECT u.id,u.username,u.display_name,d.name department_name,u.status,u.last_login_at,GROUP_CONCAT(r.code ORDER BY r.code) roles FROM users u LEFT JOIN departments d ON d.id=u.department_id LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id WHERE u.deleted_at IS NULL GROUP BY u.id,d.name ORDER BY u.id DESC`,
    );
    return rows.map((row) => ({
      id: String(row.id),
      username: row.username,
      displayName: row.display_name,
      departmentName: row.department_name,
      status: row.status,
      roles: row.roles?.split(',') ?? [],
      lastLoginAt: row.last_login_at?.toISOString() ?? null,
    }));
  }
  async createUser(payload: CreateUserRequest, passwordHash: string) {
    return withTransaction(this.pool, async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        'INSERT INTO users (department_id,username,password_hash,display_name,status) VALUES (?,?,?,?,1)',
        [payload.departmentId ?? null, payload.username, passwordHash, payload.displayName],
      );
      for (const roleId of payload.roleIds)
        await connection.execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)', [
          result.insertId,
          roleId,
        ]);
      return String(result.insertId);
    });
  }
  async setUserStatus(userId: string, status: number) {
    await this.pool.execute('UPDATE users SET status=? WHERE id=? AND deleted_at IS NULL', [
      status,
      userId,
    ]);
  }
  async setUserRoles(userId: string, roleIds: string[]) {
    await withTransaction(this.pool, async (connection) => {
      await connection.execute('DELETE FROM user_roles WHERE user_id=?', [userId]);
      for (const roleId of roleIds)
        await connection.execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)', [
          userId,
          roleId,
        ]);
    });
  }
  async listRoles(): Promise<IdentityRole[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        name: string;
        code: string;
        description: string | null;
        status: number;
        permission_ids: string | null;
      })[]
    >(
      `SELECT r.id,r.name,r.code,r.description,r.status,GROUP_CONCAT(rp.permission_id ORDER BY rp.permission_id) permission_ids FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id WHERE r.deleted_at IS NULL GROUP BY r.id ORDER BY r.id DESC`,
    );
    return rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      code: row.code,
      description: row.description,
      status: row.status,
      permissionIds: row.permission_ids?.split(',') ?? [],
    }));
  }
  async createRole(payload: CreateRoleRequest) {
    const [result] = await this.pool.execute<ResultSetHeader>(
      'INSERT INTO roles (name,code,description,status) VALUES (?,?,?,1)',
      [payload.name, payload.code, payload.description ?? null],
    );
    return String(result.insertId);
  }
  async setRolePermissions(roleId: string, permissionIds: string[]) {
    await withTransaction(this.pool, async (connection) => {
      await connection.execute('DELETE FROM role_permissions WHERE role_id=?', [roleId]);
      for (const permissionId of permissionIds)
        await connection.execute(
          'INSERT INTO role_permissions (role_id,permission_id) VALUES (?,?)',
          [roleId, permissionId],
        );
    });
  }
  async listPermissions(): Promise<IdentityPermission[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        parent_id: number | null;
        name: string;
        code: string;
        type: string;
        route_path: string | null;
        status: number;
      })[]
    >(
      'SELECT id,parent_id,name,code,type,route_path,status FROM permissions WHERE deleted_at IS NULL ORDER BY sort_order,id',
    );
    return rows.map((row) => ({
      id: String(row.id),
      parentId: row.parent_id ? String(row.parent_id) : null,
      name: row.name,
      code: row.code,
      type: row.type,
      routePath: row.route_path,
      status: row.status,
    }));
  }
  async listLogs() {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT id,log_type,module,action,user_id,target_id,target_type,result,ip,remark,created_at FROM operation_logs ORDER BY id DESC LIMIT 500',
    );
    return rows as Record<string, unknown>[];
  }
  async writeLog(entry: {
    logType: string;
    module: string;
    action: string;
    userId?: string | null;
    result: string;
    ip?: string | null;
    remark?: string | null;
  }) {
    await this.pool.execute(
      'INSERT INTO operation_logs (log_type,module,action,user_id,result,ip,remark) VALUES (?,?,?,?,?,?,?)',
      [
        entry.logType,
        entry.module,
        entry.action,
        entry.userId ?? null,
        entry.result,
        entry.ip ?? null,
        entry.remark ?? null,
      ],
    );
  }
  transaction<T>(work: (connection: import('mysql2/promise').PoolConnection) => Promise<T>) {
    return withTransaction(this.pool, work);
  }
}
