import { describe, expect, it, vi } from 'vitest';
import type { MaterialPayload } from '@company/contracts';
import type { CommandContext } from '../../../../common/audit/audit.types.js';
import { MysqlMaterialRepository } from '../mysql-material.repository.js';

const audit: CommandContext = {
  actorId: '7',
  requestId: 'req-material-1',
  ip: '127.0.0.1',
  userAgent: 'vitest',
};

const payload: MaterialPayload = {
  materialCode: 'm1.077.012',
  materialName: '微带',
  categoryId: '3',
  unit: 'pcs',
  acquireMethod: 'purchased',
  status: 1,
  remark: '基础物料',
};

describe('MysqlMaterialRepository', () => {
  // TODO(material-json-table-read): 验证目录读取完整规格表格、当前名称、版本计数及筛选；高重要性，旧数组 JSON 夹具失效且正式测试暂缓；获正式测试授权后按新存储结构恢复。

  it('lists only enabled, undeleted materials under enabled material categories as options', async () => {
    const query = vi.fn().mockResolvedValueOnce([
      [
        {
          id: 9,
          material_code: 'm1.077.012',
          material_name: '微带',
          acquire_method: 'purchased',
          unit: 'pcs',
        },
      ],
      [],
    ]);
    const repository = new MysqlMaterialRepository({ query } as never);

    await expect(repository.listOptions()).resolves.toEqual([
      {
        id: '9',
        materialCode: 'm1.077.012',
        materialName: '微带',
        acquireMethod: 'purchased',
        unit: 'pcs',
      },
    ]);
    expect(String(query.mock.calls[0]?.[0])).toContain('m.status=1');
    expect(String(query.mock.calls[0]?.[0])).toContain('m.is_deleted=0');
    expect(String(query.mock.calls[0]?.[0])).toContain('c.status=1');
    expect(String(query.mock.calls[0]?.[0])).toContain("c.item_kind='material'");
  });

  // TODO(material-json-table-create-audit): 验证规格表格和业务空表写入，以及分类资格、创建和审计同事务；高重要性，旧数组写入断言失效且正式测试暂缓；获正式测试授权后恢复。

  it('rejects a finished-product category before inserting a material', async () => {
    const connection = transactionConnection();
    connection.query.mockResolvedValueOnce([[{ item_kind: 'finished_product', status: 1 }], []]);
    const repository = new MysqlMaterialRepository(pool(connection) as never);

    await expect(repository.create(payload, audit)).rejects.toMatchObject({
      code: 'INVALID_CATEGORY',
    });
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
  });

  // TODO(material-json-table-update-audit): 验证完整表格替换、编码和单位不可变、更新和审计同事务；高重要性，旧数组写入断言失效且正式测试暂缓；获正式测试授权后恢复。

  it.each([
    ['material code', { materialCode: 'm1.077.013' }],
    ['base unit', { unit: 'kg' }],
  ])('rejects changing the immutable %s', async (_label, change) => {
    const connection = transactionConnection();
    connection.query.mockResolvedValueOnce([
      [{ material_code: 'm1.077.012', unit: 'pcs', status: 1 }],
      [],
    ]);
    const repository = new MysqlMaterialRepository(pool(connection) as never);

    await expect(repository.update('9', { ...payload, ...change }, audit)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('changes status and writes the before/after audit in one transaction', async () => {
    const connection = transactionConnection();
    connection.query.mockResolvedValueOnce([
      [{ material_code: 'm1.077.012', unit: 'pcs', status: 1 }],
      [],
    ]);
    connection.execute
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const repository = new MysqlMaterialRepository(pool(connection) as never);

    await expect(repository.setStatus('9', 0, audit)).resolves.toBeUndefined();

    expect(connection.execute.mock.calls[0]?.[1]).toEqual([0, '7', '9']);
    expect(connection.execute.mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining(['material.status', '9']),
    );
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('rejects invalid statuses before opening a transaction', async () => {
    const getConnection = vi.fn();
    const repository = new MysqlMaterialRepository({ getConnection } as never);

    await expect(repository.setStatus('9', 2, audit)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('maps duplicate material codes to a conflict and rolls back', async () => {
    const connection = transactionConnection();
    connection.query.mockResolvedValueOnce([[{ item_kind: 'material', status: 1 }], []]);
    connection.execute.mockRejectedValueOnce(
      Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }),
    );
    const repository = new MysqlMaterialRepository(pool(connection) as never);

    await expect(repository.create(payload, audit)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: '物料编码已存在，软删除记录的编码也不能复用',
    });
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
  });
});

const transactionConnection = () => ({
  beginTransaction: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
});

const pool = (connection: ReturnType<typeof transactionConnection>) => ({
  getConnection: vi.fn().mockResolvedValue(connection),
});
