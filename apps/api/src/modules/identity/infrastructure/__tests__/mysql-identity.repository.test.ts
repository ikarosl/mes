import { describe, expect, it, vi } from 'vitest';
import type { AuditLogEntry } from '../../../../common/audit/audit.types.js';
import { MysqlRbacRepository } from '../mysql-rbac.repository.js';

describe('MysqlRbacRepository audited mutations', () => {
  it('resolves persisted user references without filtering disabled or soft-deleted users', async () => {
    const query = vi.fn().mockResolvedValue([
      [
        { id: 7, display_name: '已停用负责人' },
        { id: 8, display_name: '已删除负责人' },
      ],
      [],
    ]);
    const repository = new MysqlRbacRepository({ query } as never);

    await expect(repository.listUserReferencesByIds(['7', '8'])).resolves.toEqual([
      { id: '7', displayName: '已停用负责人' },
      { id: '8', displayName: '已删除负责人' },
    ]);

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).not.toContain('status=');
    expect(sql).not.toContain('deleted_at');
    expect(query.mock.calls[0]?.[1]).toEqual(['7', '8']);
  });

  it('returns a stable server-paginated user list', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            username: 'admin',
            display_name: '管理员',
            department_id: null,
            department_name: null,
            email: null,
            mobile: null,
            status: 1,
            last_login_at: null,
            role_ids: '1',
            roles: 'ADMIN',
          },
        ],
        [],
      ]);
    const repository = new MysqlRbacRepository({ query } as never);

    await expect(
      repository.listUsers({ page: 2, pageSize: 20, keyword: 'admin', status: 1 }),
    ).resolves.toMatchObject({ total: 1, page: 2, pageSize: 20, items: [{ id: '9' }] });
    expect(String(query.mock.calls[1]?.[0])).toContain('ORDER BY u.id DESC LIMIT ? OFFSET ?');
    expect(query.mock.calls[1]?.[1]).toEqual([
      '%admin%',
      '%admin%',
      '%admin%',
      '%admin%',
      '%admin%',
      '%admin%',
      '%admin%',
      1,
      20,
      20,
    ]);
  });

  it('writes a role assignment and its audit entry on the same transaction connection', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 10 }], []]) // 锁定目标用户
        .mockResolvedValueOnce([[{ id: 2 }], []]) // 角色引用存在
        .mockResolvedValueOnce([[{ role_id: 1 }], []]), // 已有 user_roles 记录
      execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }, []]),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const repository = new MysqlRbacRepository(pool as never);

    const result = await repository.setUserRoles('10', ['2'], auditEntry('分配用户角色'));

    expect(result).toEqual({ status: 'success', value: undefined });
    const executedSql = connection.execute.mock.calls.map(([sql]) => String(sql));
    expect(executedSql.some((sql) => sql.includes('DELETE FROM user_roles'))).toBe(true);
    expect(executedSql.some((sql) => sql.includes('INSERT INTO user_roles'))).toBe(true);
    expect(executedSql.some((sql) => sql.includes('INSERT INTO operation_logs'))).toBe(true);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('returns not-found for a missing user in setUserStatus without writing an audit', async () => {
    const connection = mockConnection({ query: [[[], []]] });
    const repository = new MysqlRbacRepository(pool(connection) as never);

    const result = await repository.setUserStatus('999', 1, auditEntry('更新用户状态'));

    expect(result).toEqual({ status: 'not-found' });
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('validates the target user even for an empty role assignment', async () => {
    const connection = mockConnection({ query: [[[], []]] });
    const repository = new MysqlRbacRepository(pool(connection) as never);

    const result = await repository.setUserRoles('999', [], auditEntry('分配用户角色'));

    expect(result).toEqual({ status: 'not-found' });
    expect(connection.execute).not.toHaveBeenCalled();
  });

  it('returns invalid-reference when a role in the assignment does not exist', async () => {
    const connection = mockConnection({
      query: [
        [[{ id: 10 }], []],
        [[], []],
      ],
    });
    const repository = new MysqlRbacRepository(pool(connection) as never);

    const result = await repository.setUserRoles('10', ['999'], auditEntry('分配用户角色'));

    expect(result).toEqual({
      status: 'invalid-reference',
      message: expect.stringContaining('999'),
    });
    expect(connection.execute).not.toHaveBeenCalled();
  });

  it('validates the target role even for an empty permission assignment', async () => {
    const connection = mockConnection({ query: [[[], []]] });
    const repository = new MysqlRbacRepository(pool(connection) as never);

    const result = await repository.setRolePermissions('999', [], auditEntry('分配角色权限'));

    expect(result).toEqual({ status: 'not-found' });
    expect(connection.execute).not.toHaveBeenCalled();
  });

  it('returns invalid-reference when a permission in the assignment does not exist', async () => {
    const connection = mockConnection({
      query: [
        [[{ id: 5 }], []],
        [[], []],
      ],
    });
    const repository = new MysqlRbacRepository(pool(connection) as never);

    const result = await repository.setRolePermissions('5', ['999'], auditEntry('分配角色权限'));

    expect(result).toEqual({
      status: 'invalid-reference',
      message: expect.stringContaining('999'),
    });
    expect(connection.execute).not.toHaveBeenCalled();
  });

  it('maps a duplicate username to a conflict result and rolls back', async () => {
    const dupError = Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
    const connection = mockConnection({ executeReject: dupError });
    const repository = new MysqlRbacRepository(pool(connection) as never);

    const result = await repository.createUser(
      { username: 'admin', password: '123456', displayName: '管理员', roleIds: [] },
      'hash',
      auditEntry('创建用户'),
    );

    expect(result).toEqual({ status: 'conflict', message: '用户名已存在' });
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('maps a duplicate role code to a conflict result and rolls back', async () => {
    const dupError = Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
    const connection = mockConnection({ executeReject: dupError });
    const repository = new MysqlRbacRepository(pool(connection) as never);

    const result = await repository.createRole(
      { name: '管理员', code: 'admin' },
      auditEntry('创建角色'),
    );

    expect(result).toEqual({ status: 'conflict', message: '角色编码已存在' });
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('returns a conflict result when the role still has assigned users', async () => {
    const connection = mockConnection({
      query: [
        [[{ name: '管理员', code: 'admin' }], []],
        [[{ count: 2 }], []],
      ],
    });
    const repository = new MysqlRbacRepository(pool(connection) as never);

    const result = await repository.deleteRole('2', auditEntry('删除角色'));

    expect(result).toEqual({ status: 'conflict', message: '角色仍有关联用户，不能删除' });
    expect(connection.execute).not.toHaveBeenCalled();
  });

  it('returns not-found when deleting a missing role', async () => {
    const connection = mockConnection({ query: [[[], []]] });
    const repository = new MysqlRbacRepository(pool(connection) as never);

    const result = await repository.deleteRole('999', auditEntry('删除角色'));

    expect(result).toEqual({ status: 'not-found' });
    expect(connection.execute).not.toHaveBeenCalled();
  });
});

const auditEntry = (action: string): AuditLogEntry => ({
  logType: 'operation',
  module: 'system',
  action,
  userId: '1',
  result: 'success',
  ip: '127.0.0.1',
});

interface MockConnection {
  beginTransaction: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  rollback: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

const mockConnection = (options?: {
  query?: unknown[][];
  executeReject?: unknown;
}): MockConnection => {
  const connection = {
    beginTransaction: vi.fn(),
    query: vi.fn(),
    execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }, []]),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  if (options?.query?.length) {
    for (const result of options.query) {
      connection.query.mockResolvedValueOnce(result);
    }
  } else {
    connection.query.mockResolvedValue([[], []]);
  }
  if (options?.executeReject) connection.execute.mockRejectedValue(options.executeReject);
  return connection;
};

const pool = (connection: MockConnection) => ({
  getConnection: vi.fn().mockResolvedValue(connection),
});
