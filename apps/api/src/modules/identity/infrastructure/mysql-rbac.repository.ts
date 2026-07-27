import { Inject, Injectable } from '@nestjs/common';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  CreateSystemRolePayload,
  CreateSystemUserPayload,
  PermissionType,
  UpdateSystemRolePayload,
  UpdateSystemUserPayload,
  UserOption,
} from '@company/contracts';
import { SYSTEM_STATUS } from '@company/constants';
import { withTransaction } from '@company/database';
import type { AuditLogEntry } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/beijing-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import { type RbacRepository } from '../application/ports/rbac.repository.js';
import type {
  IdentityDepartmentOption,
  IdentityPermission,
  IdentityRole,
  IdentityRoleOption,
  IdentityUser,
} from '../domain/identity.types.js';

@Injectable()
export class MysqlRbacRepository implements RbacRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listUsers(): Promise<IdentityUser[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        username: string;
        display_name: string;
        department_id: number | null;
        department_name: string | null;
        email: string | null;
        mobile: string | null;
        status: number;
        last_login_at: Date | null;
        role_ids: string | null;
        roles: string | null;
      })[]
    >(
      `SELECT u.id,u.username,u.display_name,u.department_id,d.name department_name,u.email,u.mobile,
              u.status,u.last_login_at,GROUP_CONCAT(r.id ORDER BY r.id) role_ids,
              GROUP_CONCAT(r.code ORDER BY r.id) roles
       FROM users u
       LEFT JOIN departments d ON d.id=u.department_id AND d.deleted_at IS NULL
       LEFT JOIN user_roles ur ON ur.user_id=u.id
       LEFT JOIN roles r ON r.id=ur.role_id AND r.deleted_at IS NULL
       WHERE u.deleted_at IS NULL
       GROUP BY u.id,d.name ORDER BY u.id DESC`,
    );
    return rows.map((row) => ({
      id: String(row.id),
      username: row.username,
      displayName: row.display_name,
      departmentId: row.department_id === null ? null : String(row.department_id),
      departmentName: row.department_name,
      email: row.email,
      mobile: row.mobile,
      roleIds: row.role_ids?.split(',') ?? [],
      status: row.status,
      roles: row.roles?.split(',') ?? [],
      lastLoginAt: row.last_login_at ? toBeijingISOString(row.last_login_at) : null,
    }));
  }

  async listDepartmentOptions(): Promise<IdentityDepartmentOption[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & { id: number; parent_id: number | null; name: string; code: string })[]
    >(
      'SELECT id,parent_id,name,code FROM departments WHERE status=? AND deleted_at IS NULL ORDER BY sort_order,id',
      [SYSTEM_STATUS.enabled],
    );
    return rows.map((row) => ({
      id: String(row.id),
      parentId: row.parent_id ? String(row.parent_id) : '0',
      name: row.name,
      code: row.code,
    }));
  }

  async listRoleOptions(): Promise<IdentityRoleOption[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & { id: number; name: string; code: string })[]
    >('SELECT id,name,code FROM roles WHERE status=? AND deleted_at IS NULL ORDER BY name,id', [
      SYSTEM_STATUS.enabled,
    ]);
    return rows.map((row) => ({ id: String(row.id), name: row.name, code: row.code }));
  }

  async listActiveUserOptions(): Promise<UserOption[]> {
    const [rows] = await this.pool.query<(RowDataPacket & { id: number; display_name: string })[]>(
      'SELECT id,display_name FROM users WHERE status=? AND deleted_at IS NULL ORDER BY display_name,id',
      [SYSTEM_STATUS.enabled],
    );
    return rows.map((row) => ({ id: String(row.id), displayName: row.display_name }));
  }

  async listActiveUserOptionsByIds(ids: string[]): Promise<UserOption[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await this.pool.query<(RowDataPacket & { id: number; display_name: string })[]>(
      `SELECT id,display_name FROM users
       WHERE id IN (${placeholders}) AND status=? AND deleted_at IS NULL
       ORDER BY display_name,id`,
      [...ids, SYSTEM_STATUS.enabled],
    );
    return rows.map((row) => ({ id: String(row.id), displayName: row.display_name }));
  }

  async createUser(
    payload: CreateSystemUserPayload,
    passwordHash: string,
    audit: AuditLogEntry,
  ): Promise<string> {
    return withTransaction(this.pool, async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        'INSERT INTO users (department_id,username,password_hash,display_name,email,mobile,status) VALUES (?,?,?,?,?,?,?)',
        [
          payload.departmentId ?? null,
          payload.username,
          passwordHash,
          payload.displayName,
          payload.email || null,
          payload.mobile || null,
          normalizeStatus(payload.status),
        ],
      );
      for (const roleId of payload.roleIds ?? []) {
        await connection.execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)', [
          result.insertId,
          roleId,
        ]);
      }
      const id = String(result.insertId);
      await writeTransactionalAudit(connection, {
        ...audit,
        targetId: id,
        targetType: 'user',
        afterData: {
          username: payload.username,
          displayName: payload.displayName,
          departmentId: payload.departmentId ?? null,
          email: payload.email || null,
          mobile: payload.mobile || null,
          status: normalizeStatus(payload.status),
          roleIds: payload.roleIds ?? [],
        },
      });
      return id;
    });
  }

  async updateUser(
    userId: string,
    payload: UpdateSystemUserPayload,
    audit: AuditLogEntry,
  ): Promise<boolean> {
    return withTransaction(this.pool, async (connection) => {
      const [rows] = await connection.query<
        (RowDataPacket & {
          username: string;
          display_name: string;
          department_id: number | null;
          email: string | null;
          mobile: string | null;
        })[]
      >(
        'SELECT username,display_name,department_id,email,mobile FROM users WHERE id=? AND deleted_at IS NULL FOR UPDATE',
        [userId],
      );
      const current = rows[0];
      if (!current) return false;
      const next = {
        username: payload.username ?? current.username,
        displayName: payload.displayName ?? current.display_name,
        departmentId:
          payload.departmentId === undefined ? current.department_id : payload.departmentId,
        email: payload.email === undefined ? current.email : payload.email || null,
        mobile: payload.mobile === undefined ? current.mobile : payload.mobile || null,
      };
      await connection.execute(
        'UPDATE users SET username=?,display_name=?,department_id=?,email=?,mobile=? WHERE id=? AND deleted_at IS NULL',
        [next.username, next.displayName, next.departmentId, next.email, next.mobile, userId],
      );
      await writeTransactionalAudit(connection, {
        ...audit,
        targetId: userId,
        targetType: 'user',
        beforeData: userSnapshot(current),
        afterData: next,
      });
      return true;
    });
  }

  async setUserStatus(userId: string, status: number, audit: AuditLogEntry): Promise<void> {
    await withTransaction(this.pool, async (connection) => {
      const [rows] = await connection.query<(RowDataPacket & { status: number })[]>(
        'SELECT status FROM users WHERE id=? AND deleted_at IS NULL FOR UPDATE',
        [userId],
      );
      const current = rows[0];
      if (!current) return;
      await connection.execute('UPDATE users SET status=? WHERE id=? AND deleted_at IS NULL', [
        status,
        userId,
      ]);
      await writeTransactionalAudit(connection, {
        ...audit,
        targetId: userId,
        targetType: 'user',
        beforeData: { status: current.status },
        afterData: { status },
      });
    });
  }

  async resetUserPassword(
    userId: string,
    passwordHash: string,
    audit: AuditLogEntry,
  ): Promise<boolean> {
    return withTransaction(this.pool, async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        'UPDATE users SET password_hash=? WHERE id=? AND deleted_at IS NULL',
        [passwordHash, userId],
      );
      if (result.affectedRows !== 1) return false;
      await connection.execute(
        'UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=? AND revoked_at IS NULL',
        [userId],
      );
      await writeTransactionalAudit(connection, {
        ...audit,
        targetId: userId,
        targetType: 'user',
        afterData: { refreshTokensRevoked: true },
      });
      return true;
    });
  }

  async setUserRoles(userId: string, roleIds: string[], audit: AuditLogEntry): Promise<void> {
    await withTransaction(this.pool, async (connection) => {
      const [rows] = await connection.query<(RowDataPacket & { role_id: number })[]>(
        'SELECT role_id FROM user_roles WHERE user_id=? ORDER BY role_id FOR UPDATE',
        [userId],
      );
      await connection.execute('DELETE FROM user_roles WHERE user_id=?', [userId]);
      for (const roleId of roleIds) {
        await connection.execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)', [
          userId,
          roleId,
        ]);
      }
      await writeTransactionalAudit(connection, {
        ...audit,
        targetId: userId,
        targetType: 'user',
        beforeData: { roleIds: rows.map((row) => String(row.role_id)) },
        afterData: { roleIds },
      });
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
        permission_count: number;
        user_count: number;
        updated_at: Date | null;
      })[]
    >(
      `SELECT r.id,r.name,r.code,r.description,r.status,r.updated_at,
              (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id=r.id) permission_count,
              (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id=r.id) user_count
       FROM roles r WHERE r.deleted_at IS NULL ORDER BY r.id DESC`,
    );
    return rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      code: row.code,
      description: row.description,
      status: row.status,
      permissionCount: row.permission_count,
      userCount: row.user_count,
      updatedAt: row.updated_at ? toBeijingISOString(row.updated_at) : null,
    }));
  }

  async createRole(payload: CreateSystemRolePayload, audit: AuditLogEntry): Promise<string> {
    return withTransaction(this.pool, async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        'INSERT INTO roles (name,code,description,status) VALUES (?,?,?,?)',
        [payload.name, payload.code, payload.description ?? null, normalizeStatus(payload.status)],
      );
      const id = String(result.insertId);
      await writeTransactionalAudit(connection, {
        ...audit,
        targetId: id,
        targetType: 'role',
        afterData: {
          name: payload.name,
          code: payload.code,
          description: payload.description ?? null,
          status: normalizeStatus(payload.status),
        },
      });
      return id;
    });
  }

  async updateRole(
    roleId: string,
    payload: UpdateSystemRolePayload,
    audit: AuditLogEntry,
  ): Promise<boolean> {
    return withTransaction(this.pool, async (connection) => {
      const [rows] = await connection.query<
        (RowDataPacket & {
          name: string;
          code: string;
          description: string | null;
          status: number;
        })[]
      >(
        'SELECT name,code,description,status FROM roles WHERE id=? AND deleted_at IS NULL FOR UPDATE',
        [roleId],
      );
      const current = rows[0];
      if (!current) return false;
      const next = {
        name: payload.name ?? current.name,
        code: payload.code ?? current.code,
        description: payload.description === undefined ? current.description : payload.description,
        status: payload.status === undefined ? current.status : normalizeStatus(payload.status),
      };
      await connection.execute(
        'UPDATE roles SET name=?,code=?,description=?,status=? WHERE id=? AND deleted_at IS NULL',
        [next.name, next.code, next.description, next.status, roleId],
      );
      await writeTransactionalAudit(connection, {
        ...audit,
        targetId: roleId,
        targetType: 'role',
        beforeData: current,
        afterData: next,
      });
      return true;
    });
  }

  async deleteRole(
    roleId: string,
    audit: AuditLogEntry,
  ): Promise<'deleted' | 'not-found' | 'in-use'> {
    return withTransaction(this.pool, async (connection) => {
      const [roles] = await connection.query<(RowDataPacket & { name: string; code: string })[]>(
        'SELECT name,code FROM roles WHERE id=? AND deleted_at IS NULL FOR UPDATE',
        [roleId],
      );
      const role = roles[0];
      if (!role) return 'not-found';
      const [counts] = await connection.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM user_roles WHERE role_id=?',
        [roleId],
      );
      if ((counts[0]?.count ?? 0) > 0) return 'in-use';
      await connection.execute('DELETE FROM role_permissions WHERE role_id=?', [roleId]);
      await connection.execute('UPDATE roles SET deleted_at=NOW(),status=? WHERE id=?', [
        SYSTEM_STATUS.disabled,
        roleId,
      ]);
      await writeTransactionalAudit(connection, {
        ...audit,
        targetId: roleId,
        targetType: 'role',
        beforeData: role,
        afterData: { deleted: true },
      });
      return 'deleted';
    });
  }

  async getRolePermissionIds(roleId: string): Promise<string[] | null> {
    const [roles] = await this.pool.query<(RowDataPacket & { id: number })[]>(
      'SELECT id FROM roles WHERE id=? AND deleted_at IS NULL LIMIT 1',
      [roleId],
    );
    if (!roles[0]) return null;
    const [rows] = await this.pool.query<(RowDataPacket & { permission_id: number })[]>(
      'SELECT permission_id FROM role_permissions WHERE role_id=? ORDER BY permission_id',
      [roleId],
    );
    return rows.map((row) => String(row.permission_id));
  }

  async setRolePermissions(
    roleId: string,
    permissionIds: string[],
    audit: AuditLogEntry,
  ): Promise<void> {
    await withTransaction(this.pool, async (connection) => {
      const [rows] = await connection.query<(RowDataPacket & { permission_id: number })[]>(
        'SELECT permission_id FROM role_permissions WHERE role_id=? ORDER BY permission_id FOR UPDATE',
        [roleId],
      );
      await connection.execute('DELETE FROM role_permissions WHERE role_id=?', [roleId]);
      for (const permissionId of permissionIds) {
        await connection.execute(
          'INSERT INTO role_permissions (role_id,permission_id) VALUES (?,?)',
          [roleId, permissionId],
        );
      }
      await writeTransactionalAudit(connection, {
        ...audit,
        targetId: roleId,
        targetType: 'role',
        beforeData: { permissionIds: rows.map((row) => String(row.permission_id)) },
        afterData: { permissionIds },
      });
    });
  }

  async listPermissions(): Promise<IdentityPermission[]> {
    const [rows] = await this.pool.query<
      (RowDataPacket & {
        id: number;
        parent_id: number | null;
        name: string;
        code: string;
        type: PermissionType;
        route_path: string | null;
        api_method: string | null;
        api_path: string | null;
        status: number;
      })[]
    >(
      'SELECT id,parent_id,name,code,type,route_path,api_method,api_path,status FROM permissions WHERE deleted_at IS NULL ORDER BY sort_order,id',
    );
    return rows.map((row) => ({
      id: String(row.id),
      parentId: row.parent_id ? String(row.parent_id) : null,
      name: row.name,
      code: row.code,
      type: row.type,
      routePath: row.route_path,
      apiMethod: row.api_method,
      apiPath: row.api_path,
      status: row.status,
    }));
  }
}

const normalizeStatus = (status: number | boolean | undefined): number =>
  status === false || status === SYSTEM_STATUS.disabled
    ? SYSTEM_STATUS.disabled
    : SYSTEM_STATUS.enabled;

const userSnapshot = (row: {
  username: string;
  display_name: string;
  department_id: number | null;
  email: string | null;
  mobile: string | null;
}) => ({
  username: row.username,
  displayName: row.display_name,
  departmentId: row.department_id === null ? null : String(row.department_id),
  email: row.email,
  mobile: row.mobile,
});
