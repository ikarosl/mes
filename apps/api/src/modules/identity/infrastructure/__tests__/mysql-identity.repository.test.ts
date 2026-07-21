import { describe, expect, it, vi } from 'vitest';
import { MysqlIdentityRepository } from '../mysql-identity.repository.js';

describe('MysqlIdentityRepository audited mutations', () => {
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
    const repository = new MysqlIdentityRepository(pool as never);

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
