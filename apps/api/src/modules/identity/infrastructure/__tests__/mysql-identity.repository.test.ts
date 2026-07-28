import { describe, expect, it, vi } from 'vitest';
import { MysqlRbacRepository } from '../mysql-rbac.repository.js';

describe('MysqlRbacRepository audited mutations', () => {
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
      query: vi.fn().mockResolvedValue([[{ role_id: 1 }], []]),
      execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }, []]),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const repository = new MysqlRbacRepository(pool as never);

    await repository.setUserRoles('10', ['2'], {
      logType: 'operation',
      module: 'system',
      action: '分配用户角色',
      userId: '1',
      result: 'success',
      ip: '127.0.0.1',
    });

    const executedSql = connection.execute.mock.calls.map(([sql]) => String(sql));
    expect(executedSql.some((sql) => sql.includes('DELETE FROM user_roles'))).toBe(true);
    expect(executedSql.some((sql) => sql.includes('INSERT INTO user_roles'))).toBe(true);
    expect(executedSql.some((sql) => sql.includes('INSERT INTO operation_logs'))).toBe(true);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });
});
