import { loadWorkspaceEnv } from '../../../packages/config/src/index.js';
import {
  createPool,
  type ExecuteValues,
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from '../../../apps/api/node_modules/mysql2/promise.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditLogEntry } from '../../../apps/api/src/common/audit/audit.types.js';
import { MysqlRbacRepository } from '../../../apps/api/src/modules/identity/infrastructure/mysql-rbac.repository.js';

loadWorkspaceEnv();

const describeMysql = process.env.RUN_MYSQL_INTEGRATION === '1' ? describe : describe.skip;

describeMysql('Identity RBAC MySQL persistence', () => {
  let pool: Pool;
  let repository: MysqlRbacRepository;
  let fixture: Fixture;

  beforeAll(async () => {
    pool = createPool({
      host: requiredEnv('DB_HOST'),
      port: Number(requiredEnv('DB_PORT')),
      user: requiredEnv('DB_USER'),
      password: requiredEnv('DB_PASSWORD'),
      database: requiredEnv('DB_NAME'),
      charset: 'utf8mb4',
      timezone: '+08:00',
      connectionLimit: 4,
    });
    repository = new MysqlRbacRepository(pool);
    fixture = await createFixture(pool);
  });

  afterAll(async () => {
    if (pool && fixture) {
      await pool.execute('DELETE FROM operation_logs WHERE request_id=?', [fixture.requestId]);
      await pool.execute('DELETE FROM user_roles WHERE user_id IN (?,?)', [
        fixture.userId,
        fixture.secondUserId,
      ]);
      await pool.execute('DELETE FROM role_permissions WHERE role_id IN (?,?)', [
        fixture.roleId,
        fixture.secondRoleId,
      ]);
      await pool.execute('DELETE FROM refresh_tokens WHERE user_id IN (?,?)', [
        fixture.userId,
        fixture.secondUserId,
      ]);
      await pool.execute('DELETE FROM users WHERE id IN (?,?)', [
        fixture.userId,
        fixture.secondUserId,
      ]);
      await pool.execute('DELETE FROM roles WHERE id IN (?,?)', [
        fixture.roleId,
        fixture.secondRoleId,
      ]);
      await pool.execute('DELETE FROM permissions WHERE id IN (?,?)', [
        fixture.permissionId,
        fixture.secondPermissionId,
      ]);
      await pool.execute('DELETE FROM departments WHERE id=?', [fixture.departmentId]);
    }
    await pool?.end();
  });

  it('returns not-found for a missing user status update and writes no success audit', async () => {
    const requestId = `${fixture.requestId}-status-missing`;
    const result = await repository.setUserStatus(
      '999999',
      1,
      auditEntry('更新用户状态', requestId),
    );

    expect(result).toEqual({ status: 'not-found' });
    await expectAuditAbsent(pool, requestId);
  });

  it('updates an existing user status and writes the success audit in the same transaction', async () => {
    const requestId = `${fixture.requestId}-status-ok`;
    const result = await repository.setUserStatus(
      String(fixture.userId),
      0,
      auditEntry('更新用户状态', requestId),
    );

    expect(result).toEqual({ status: 'success', value: undefined });
    const [[row]] = await pool.query<(RowDataPacket & { status: number })[]>(
      'SELECT status FROM users WHERE id=?',
      [fixture.userId],
    );
    expect(row.status).toBe(0);
    const logs = await readAudit(pool, requestId);
    expect(logs).toHaveLength(1);
    expect(logs[0].result).toBe('success');
  });

  it('validates the target user even for an empty role assignment', async () => {
    const result = await repository.setUserRoles(
      '999999',
      [],
      auditEntry('分配用户角色', `${fixture.requestId}-roles-missing-user`),
    );

    expect(result).toEqual({ status: 'not-found' });
  });

  it('assigns roles to an existing user and records the audit', async () => {
    const requestId = `${fixture.requestId}-roles-ok`;
    const result = await repository.setUserRoles(
      String(fixture.userId),
      [String(fixture.roleId)],
      auditEntry('分配用户角色', requestId),
    );

    expect(result).toEqual({ status: 'success', value: undefined });
    const [rows] = await pool.query<(RowDataPacket & { role_id: number })[]>(
      'SELECT role_id FROM user_roles WHERE user_id=?',
      [fixture.userId],
    );
    expect(rows.map((r) => String(r.role_id))).toEqual([String(fixture.roleId)]);
    await expectAuditPresent(pool, requestId);
  });

  it('returns invalid-reference for a role id that does not exist', async () => {
    const result = await repository.setUserRoles(
      String(fixture.userId),
      ['999999'],
      auditEntry('分配用户角色', `${fixture.requestId}-roles-invalid`),
    );

    expect(result).toEqual({
      status: 'invalid-reference',
      message: expect.stringContaining('999999'),
    });
  });

  it('rejects a soft-deleted role as an invalid reference', async () => {
    await pool.execute('UPDATE roles SET deleted_at=NOW() WHERE id=?', [fixture.secondRoleId]);
    const result = await repository.setUserRoles(
      String(fixture.userId),
      [String(fixture.secondRoleId)],
      auditEntry('分配用户角色', `${fixture.requestId}-roles-soft-deleted`),
    );

    expect(result).toEqual({
      status: 'invalid-reference',
      message: expect.stringContaining(String(fixture.secondRoleId)),
    });
    await pool.execute('UPDATE roles SET deleted_at=NULL WHERE id=?', [fixture.secondRoleId]);
  });

  it('validates the target role even for an empty permission assignment', async () => {
    const result = await repository.setRolePermissions(
      '999999',
      [],
      auditEntry('分配角色权限', `${fixture.requestId}-perms-missing-role`),
    );

    expect(result).toEqual({ status: 'not-found' });
  });

  it('returns invalid-reference for a permission id that does not exist', async () => {
    const result = await repository.setRolePermissions(
      String(fixture.roleId),
      ['999999'],
      auditEntry('分配角色权限', `${fixture.requestId}-perms-invalid`),
    );

    expect(result).toEqual({
      status: 'invalid-reference',
      message: expect.stringContaining('999999'),
    });
  });

  it('maps a duplicate username to a conflict result without creating a second user', async () => {
    const result = await repository.createUser(
      { username: fixture.username, displayName: '重复用户', password: '123456', roleIds: [] },
      'hash',
      auditEntry('创建用户', `${fixture.requestId}-user-dup`),
    );

    expect(result).toEqual({ status: 'conflict', message: '用户名已存在' });
    const [[count]] = await pool.query<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) total FROM users WHERE username=?',
      [fixture.username],
    );
    expect(Number(count.total)).toBe(1);
  });

  it('maps a duplicate role code to a conflict result', async () => {
    const result = await repository.createRole(
      { name: '重复角色', code: fixture.roleCode },
      auditEntry('创建角色', `${fixture.requestId}-role-dup`),
    );

    expect(result).toEqual({ status: 'conflict', message: '角色编码已存在' });
  });

  it('rejects deleting a role that still has assigned users', async () => {
    await pool.execute('INSERT INTO user_roles (user_id, role_id) VALUES (?,?)', [
      fixture.secondUserId,
      fixture.roleId,
    ]);
    const result = await repository.deleteRole(
      String(fixture.roleId),
      auditEntry('删除角色', `${fixture.requestId}-role-in-use`),
    );

    expect(result).toEqual({ status: 'conflict', message: '角色仍有关联用户，不能删除' });
    await pool.execute('DELETE FROM user_roles WHERE user_id=? AND role_id=?', [
      fixture.secondUserId,
      fixture.roleId,
    ]);
  });

  it('returns invalid-reference for a department that does not exist on user update', async () => {
    const result = await repository.updateUser(
      String(fixture.userId),
      { departmentId: '999999' },
      auditEntry('更新用户资料', `${fixture.requestId}-dept-invalid`),
    );

    expect(result).toEqual({ status: 'invalid-reference', message: '所选部门不存在或已停用' });
  });
});

interface Fixture {
  requestId: string;
  departmentId: number;
  userId: number;
  secondUserId: number;
  roleId: number;
  secondRoleId: number;
  permissionId: number;
  secondPermissionId: number;
  username: string;
  roleCode: string;
}

const auditEntry = (action: string, requestId: string): AuditLogEntry => ({
  logType: 'operation',
  module: 'system',
  action,
  userId: '1',
  result: 'success',
  ip: '127.0.0.1',
  requestId,
});

const readAudit = async (
  pool: Pool,
  requestId: string,
): Promise<(RowDataPacket & { result: string })[]> => {
  const [rows] = await pool.query<(RowDataPacket & { result: string })[]>(
    'SELECT result FROM operation_logs WHERE request_id=?',
    [requestId],
  );
  return rows;
};

const expectAuditPresent = async (pool: Pool, requestId: string) => {
  const logs = await readAudit(pool, requestId);
  expect(logs.length).toBeGreaterThan(0);
};

const expectAuditAbsent = async (pool: Pool, requestId: string) => {
  const logs = await readAudit(pool, requestId);
  expect(logs).toEqual([]);
};

const createFixture = async (pool: Pool): Promise<Fixture> => {
  const token = `rbac-test-${Date.now()}-${process.pid}`;
  const departmentId = await insert(
    pool,
    'INSERT INTO departments (name, code, status) VALUES (?,?,1)',
    [`${token}-dept`, `${token}-dept`],
  );
  const roleId = await insert(pool, 'INSERT INTO roles (name, code, status) VALUES (?,?,1)', [
    `${token}-role`,
    `${token}-role`,
  ]);
  const secondRoleId = await insert(pool, 'INSERT INTO roles (name, code, status) VALUES (?,?,1)', [
    `${token}-role2`,
    `${token}-role2`,
  ]);
  const permissionId = await insert(
    pool,
    'INSERT INTO permissions (name, code, type, status) VALUES (?,?,?,1)',
    [`${token}-perm`, `${token}-perm`, 'api'],
  );
  const secondPermissionId = await insert(
    pool,
    'INSERT INTO permissions (name, code, type, status) VALUES (?,?,?,1)',
    [`${token}-perm2`, `${token}-perm2`, 'api'],
  );
  const userId = await insert(
    pool,
    'INSERT INTO users (department_id, username, password_hash, display_name, status) VALUES (?,?,?,?,1)',
    [departmentId, `${token}-user`, 'hash', `${token} user`, 1],
  );
  const secondUserId = await insert(
    pool,
    'INSERT INTO users (username, password_hash, display_name, status) VALUES (?,?,?,1)',
    [`${token}-user2`, 'hash', `${token} user2`, 1],
  );
  await pool.execute('INSERT INTO role_permissions (role_id, permission_id) VALUES (?,?)', [
    roleId,
    permissionId,
  ]);
  return {
    requestId: `${token}-request`,
    departmentId,
    userId,
    secondUserId,
    roleId,
    secondRoleId,
    permissionId,
    secondPermissionId,
    username: `${token}-user`,
    roleCode: `${token}-role`,
  };
};

const insert = async (pool: Pool, sql: string, values: ExecuteValues[]) => {
  const [result] = await pool.execute<ResultSetHeader>(sql, values);
  return Number(result.insertId);
};

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for MySQL integration test`);
  return value;
};
