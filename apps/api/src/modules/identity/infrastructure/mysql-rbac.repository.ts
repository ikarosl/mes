import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type {
  CreateSystemRolePayload,
  CreateSystemUserPayload,
  PermissionType,
  PageResult,
  SystemRoleQuery,
  SystemUserQuery,
  UpdateSystemRolePayload,
  UpdateSystemUserPayload,
  UserOption,
} from '@company/contracts';
import { SYSTEM_STATUS } from '@company/constants';
import { withActiveConnection, withTransaction } from '@company/database';
import type { AuditLogEntry } from '../../../common/audit/audit.types.js';
import { writeTransactionalAudit } from '../../../common/audit/transactional-audit-writer.js';
import { toBeijingISOString } from '../../../common/time/beijing-time.js';
import { DATABASE_POOL } from '../../../infrastructure/database/database.module.js';
import {
  type RbacRepository,
  type RbacWriteFailure,
  type RbacWriteResult,
} from '../application/ports/rbac.repository.js';
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

  async listUsers(query: SystemUserQuery): Promise<PageResult<IdentityUser>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const conditions = ['u.deleted_at IS NULL'];
    const parameters: Array<string | number> = [];
    if (query.keyword) {
      const keyword = `%${query.keyword}%`;
      conditions.push(`(u.username LIKE ? OR u.display_name LIKE ? OR d.name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ?
        OR EXISTS (SELECT 1 FROM user_roles kur JOIN roles kr ON kr.id=kur.role_id AND kr.deleted_at IS NULL
                   WHERE kur.user_id=u.id AND (kr.name LIKE ? OR kr.code LIKE ?)))`);
      parameters.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword);
    }
    if (query.username) {
      conditions.push('u.username LIKE ?');
      parameters.push(`%${query.username}%`);
    }
    if (query.displayName) {
      conditions.push('u.display_name LIKE ?');
      parameters.push(`%${query.displayName}%`);
    }
    if (query.roleId) {
      conditions.push(
        'EXISTS (SELECT 1 FROM user_roles fur WHERE fur.user_id=u.id AND fur.role_id=?)',
      );
      parameters.push(query.roleId);
    }
    if (query.status !== undefined) {
      conditions.push('u.status=?');
      parameters.push(query.status);
    }
    const where = conditions.join(' AND ');
    const [[countRow]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM users u
       LEFT JOIN departments d ON d.id=u.department_id AND d.deleted_at IS NULL
       WHERE ${where}`,
      parameters,
    );
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
       WHERE ${where}
       GROUP BY u.id,d.name ORDER BY u.id DESC LIMIT ? OFFSET ?`,
      [...parameters, pageSize, (page - 1) * pageSize],
    );
    const items = rows.map((row) => ({
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
    return { items, total: Number(countRow?.total ?? 0), page, pageSize };
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
    // 复用调用栈既有事务连接（幂等 executor 外层事务内的业务校验），使校验与业务写入同一事务上下文。
    return withActiveConnection(this.pool, async (queryable) => {
      const [rows] = await queryable.query<
        (RowDataPacket & { id: number; display_name: string })[]
      >(
        `SELECT id,display_name FROM users
         WHERE id IN (${placeholders}) AND status=? AND deleted_at IS NULL
         ORDER BY display_name,id`,
        [...ids, SYSTEM_STATUS.enabled],
      );
      return rows.map((row) => ({ id: String(row.id), displayName: row.display_name }));
    });
  }

  async listUserReferencesByIds(ids: string[]): Promise<UserOption[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    // 幂等结果快照富化读取同样复用事务连接，保证响应快照与业务写入同一事务上下文。
    return withActiveConnection(this.pool, async (queryable) => {
      const [rows] = await queryable.query<
        (RowDataPacket & { id: number; display_name: string })[]
      >(
        `SELECT id,display_name FROM users
         WHERE id IN (${placeholders})
         ORDER BY id`,
        ids,
      );
      return rows.map((row) => ({ id: String(row.id), displayName: row.display_name }));
    });
  }

  async createUser(
    payload: CreateSystemUserPayload,
    passwordHash: string,
    audit: AuditLogEntry,
  ): Promise<RbacWriteResult<string>> {
    try {
      return await withTransaction(this.pool, async (connection) => {
        const roleIds = [...(payload.roleIds ?? [])].sort(compareNumericId);
        const missingRoles = await findMissingReferenceIds(connection, 'roles', roleIds);
        if (missingRoles.length > 0)
          return { status: 'invalid-reference', message: '包含无效的角色引用' };
        if (payload.departmentId) {
          const missingDepartments = await findMissingReferenceIds(connection, 'departments', [
            payload.departmentId,
          ]);
          if (missingDepartments.length > 0)
            return { status: 'invalid-reference', message: '所选部门不存在或已停用' };
        }
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
        for (const roleId of roleIds) {
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
            roleIds,
          },
        });
        return writeSuccess(id);
      });
    } catch (error) {
      return mapWriteError(error, '用户名已存在');
    }
  }

  async updateUser(
    userId: string,
    payload: UpdateSystemUserPayload,
    audit: AuditLogEntry,
  ): Promise<RbacWriteResult> {
    try {
      return await withTransaction(this.pool, async (connection) => {
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
        if (!current) return { status: 'not-found' };
        const departmentId =
          payload.departmentId === undefined ? current.department_id : payload.departmentId;
        if (departmentId !== null) {
          const missingDepartments = await findMissingReferenceIds(connection, 'departments', [
            String(departmentId),
          ]);
          if (missingDepartments.length > 0)
            return { status: 'invalid-reference', message: '所选部门不存在或已停用' };
        }
        const next = {
          username: payload.username ?? current.username,
          displayName: payload.displayName ?? current.display_name,
          departmentId,
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
        return writeSuccess(undefined);
      });
    } catch (error) {
      return mapWriteError(error, '用户名已存在');
    }
  }

  async setUserStatus(
    userId: string,
    status: number,
    audit: AuditLogEntry,
  ): Promise<RbacWriteResult> {
    return withTransaction(this.pool, async (connection) => {
      const [rows] = await connection.query<(RowDataPacket & { status: number })[]>(
        'SELECT status FROM users WHERE id=? AND deleted_at IS NULL FOR UPDATE',
        [userId],
      );
      const current = rows[0];
      if (!current) return { status: 'not-found' };
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
      return writeSuccess(undefined);
    });
  }

  async resetUserPassword(
    userId: string,
    passwordHash: string,
    audit: AuditLogEntry,
  ): Promise<RbacWriteResult> {
    return withTransaction(this.pool, async (connection) => {
      const [rows] = await connection.query<(RowDataPacket & { id: number })[]>(
        'SELECT id FROM users WHERE id=? AND deleted_at IS NULL FOR UPDATE',
        [userId],
      );
      if (!rows[0]) return { status: 'not-found' };
      await connection.execute(
        'UPDATE users SET password_hash=? WHERE id=? AND deleted_at IS NULL',
        [passwordHash, userId],
      );
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
      return writeSuccess(undefined);
    });
  }

  async setUserRoles(
    userId: string,
    roleIds: string[],
    audit: AuditLogEntry,
  ): Promise<RbacWriteResult> {
    try {
      return await withTransaction(this.pool, async (connection) => {
        const [users] = await connection.query<(RowDataPacket & { id: number })[]>(
          'SELECT id FROM users WHERE id=? AND deleted_at IS NULL FOR UPDATE',
          [userId],
        );
        if (!users[0]) return { status: 'not-found' };
        const sortedRoleIds = [...roleIds].sort(compareNumericId);
        const missingRoles = await findMissingReferenceIds(connection, 'roles', sortedRoleIds);
        if (missingRoles.length > 0)
          return {
            status: 'invalid-reference',
            message: `包含无效的角色引用：${missingRoles.join(', ')}`,
          };
        const [rows] = await connection.query<(RowDataPacket & { role_id: number })[]>(
          'SELECT role_id FROM user_roles WHERE user_id=? ORDER BY role_id FOR UPDATE',
          [userId],
        );
        await connection.execute('DELETE FROM user_roles WHERE user_id=?', [userId]);
        for (const roleId of sortedRoleIds) {
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
        return writeSuccess(undefined);
      });
    } catch (error) {
      return mapWriteError(error, '包含无效的角色引用');
    }
  }

  async listRoles(query: SystemRoleQuery): Promise<PageResult<IdentityRole>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const conditions = ['r.deleted_at IS NULL'];
    const parameters: Array<string | number> = [];
    if (query.keyword) {
      const keyword = `%${query.keyword}%`;
      conditions.push('(r.name LIKE ? OR r.code LIKE ? OR r.description LIKE ?)');
      parameters.push(keyword, keyword, keyword);
    }
    if (query.name) {
      conditions.push('r.name LIKE ?');
      parameters.push(`%${query.name}%`);
    }
    if (query.code) {
      conditions.push('r.code LIKE ?');
      parameters.push(`%${query.code}%`);
    }
    if (query.status !== undefined) {
      conditions.push('r.status=?');
      parameters.push(query.status);
    }
    const where = conditions.join(' AND ');
    const [[countRow]] = await this.pool.query<(RowDataPacket & { total: number })[]>(
      `SELECT COUNT(*) total FROM roles r WHERE ${where}`,
      parameters,
    );
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
       FROM roles r WHERE ${where} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
      [...parameters, pageSize, (page - 1) * pageSize],
    );
    const items = rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      code: row.code,
      description: row.description,
      status: row.status,
      permissionCount: row.permission_count,
      userCount: row.user_count,
      updatedAt: row.updated_at ? toBeijingISOString(row.updated_at) : null,
    }));
    return { items, total: Number(countRow?.total ?? 0), page, pageSize };
  }

  async createRole(
    payload: CreateSystemRolePayload,
    audit: AuditLogEntry,
  ): Promise<RbacWriteResult<string>> {
    try {
      return await withTransaction(this.pool, async (connection) => {
        const [result] = await connection.execute<ResultSetHeader>(
          'INSERT INTO roles (name,code,description,status) VALUES (?,?,?,?)',
          [
            payload.name,
            payload.code,
            payload.description ?? null,
            normalizeStatus(payload.status),
          ],
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
        return writeSuccess(id);
      });
    } catch (error) {
      return mapWriteError(error, '角色编码已存在');
    }
  }

  async updateRole(
    roleId: string,
    payload: UpdateSystemRolePayload,
    audit: AuditLogEntry,
  ): Promise<RbacWriteResult> {
    try {
      return await withTransaction(this.pool, async (connection) => {
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
        if (!current) return { status: 'not-found' };
        const next = {
          name: payload.name ?? current.name,
          code: payload.code ?? current.code,
          description:
            payload.description === undefined ? current.description : payload.description,
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
        return writeSuccess(undefined);
      });
    } catch (error) {
      return mapWriteError(error, '角色编码已存在');
    }
  }

  async deleteRole(roleId: string, audit: AuditLogEntry): Promise<RbacWriteResult> {
    return withTransaction(this.pool, async (connection) => {
      const [roles] = await connection.query<(RowDataPacket & { name: string; code: string })[]>(
        'SELECT name,code FROM roles WHERE id=? AND deleted_at IS NULL FOR UPDATE',
        [roleId],
      );
      const role = roles[0];
      if (!role) return { status: 'not-found' };
      const [counts] = await connection.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) count FROM user_roles WHERE role_id=?',
        [roleId],
      );
      if ((counts[0]?.count ?? 0) > 0)
        return { status: 'conflict', message: '角色仍有关联用户，不能删除' };
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
      return writeSuccess(undefined);
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
  ): Promise<RbacWriteResult> {
    try {
      return await withTransaction(this.pool, async (connection) => {
        const [roles] = await connection.query<(RowDataPacket & { id: number })[]>(
          'SELECT id FROM roles WHERE id=? AND deleted_at IS NULL FOR UPDATE',
          [roleId],
        );
        if (!roles[0]) return { status: 'not-found' };
        const sortedPermissionIds = [...permissionIds].sort(compareNumericId);
        const missingPermissions = await findMissingReferenceIds(
          connection,
          'permissions',
          sortedPermissionIds,
        );
        if (missingPermissions.length > 0)
          return {
            status: 'invalid-reference',
            message: `包含无效的权限引用：${missingPermissions.join(', ')}`,
          };
        const [rows] = await connection.query<(RowDataPacket & { permission_id: number })[]>(
          'SELECT permission_id FROM role_permissions WHERE role_id=? ORDER BY permission_id FOR UPDATE',
          [roleId],
        );
        await connection.execute('DELETE FROM role_permissions WHERE role_id=?', [roleId]);
        for (const permissionId of sortedPermissionIds) {
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
        return writeSuccess(undefined);
      });
    } catch (error) {
      return mapWriteError(error, '包含无效的权限引用');
    }
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

const writeSuccess = <T>(value: T): RbacWriteResult<T> => ({ status: 'success', value });

type ReferenceTable = 'roles' | 'permissions' | 'departments';

/** 返回 ids 中不存在（软删除视为不存在）的引用，用于把引用失败映射为稳定 invalid-reference，而不是外键 500。 */
const findMissingReferenceIds = async (
  connection: Pick<PoolConnection, 'query'>,
  table: ReferenceTable,
  ids: string[],
): Promise<string[]> => {
  if (ids.length === 0) return [];
  // 锁定引用记录：防止校验通过后、写入前引用被并发软删除/删除，导致外键虽通过却写入已删除引用。
  // 升序锁定保证并发请求对同一批引用按相同顺序加锁，避免不同数组顺序造成的死锁。
  const sortedIds = [...ids].sort(compareNumericId);
  const placeholders = sortedIds.map(() => '?').join(',');
  const [rows] = await connection.query<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM ${table} WHERE id IN (${placeholders}) AND deleted_at IS NULL FOR UPDATE`,
    sortedIds,
  );
  const existing = new Set(rows.map((row) => String(row.id)));
  return ids.filter((id) => !existing.has(id));
};

/** 按数值升序比较 BIGINT 主键字符串，保证多行引用锁的获取顺序一致。 */
const compareNumericId = (a: string, b: string): number =>
  BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;

/** 把基础设施层可预期的数据库错误映射为写结果；未预期的错误继续上抛。 */
const mapWriteError = (error: unknown, dupMessage: string): RbacWriteFailure => {
  const code = (error as { code?: string })?.code;
  if (code === 'ER_DUP_ENTRY') return { status: 'conflict', message: dupMessage };
  if (code === 'ER_NO_REFERENCED_ROW_2')
    return { status: 'invalid-reference', message: '包含无效的引用数据' };
  throw error;
};
