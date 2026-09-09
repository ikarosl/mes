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
  specValues: [{ key: '阻抗', value: '50', unit: 'ohm' }],
  status: 1,
  remark: '基础物料',
};

describe('MysqlMaterialRepository', () => {
  it('lists current material names and versions with the material-only filters', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            material_code: 'm1.077.012',
            material_name: '当前名称',
            category_id: 3,
            category_code: 'MAT',
            category_name: '元件',
            unit: 'pcs',
            acquire_method: 'purchased',
            spec_values: '[{"key":"阻抗","value":"50","unit":"ohm"}]',
            status: 1,
            remark: null,
            updated_at: new Date('2026-07-23T01:00:00.000Z'),
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 11,
            material_id: 9,
            material_code: 'm1.077.012',
            material_name: '当前名称',
            major_version: '1',
            minor_version: '2',
            variant_code: 'm1.077.012-1-2',
            status: 1,
            remark: null,
            updated_at: null,
          },
        ],
        [],
      ]);
    const repository = new MysqlMaterialRepository({ query } as never);

    await expect(
      repository.list({
        page: 2,
        pageSize: 20,
        keyword: 'm1',
        categoryId: '3',
        acquireMethod: 'purchased',
        status: 1,
      }),
    ).resolves.toEqual({
      items: [
        {
          id: '9',
          materialCode: 'm1.077.012',
          materialName: '当前名称',
          categoryId: '3',
          categoryCode: 'MAT',
          categoryName: '元件',
          unit: 'pcs',
          acquireMethod: 'purchased',
          specValues: [{ key: '阻抗', value: '50', unit: 'ohm' }],
          status: 1,
          variantCount: 1,
          variants: [
            {
              id: '11',
              materialId: '9',
              materialCode: 'm1.077.012',
              materialName: '当前名称',
              majorVersion: '1',
              minorVersion: '2',
              variantCode: 'm1.077.012-1-2',
              status: 1,
              remark: null,
              updatedAt: null,
            },
          ],
          remark: null,
          updatedAt: '2026-07-23T09:00:00.000+08:00',
        },
      ],
      total: 1,
      page: 2,
      pageSize: 20,
    });

    expect(String(query.mock.calls[0]?.[0])).toContain('m.is_deleted=0');
    expect(String(query.mock.calls[0]?.[0])).toContain("c.item_kind='material'");
    expect(String(query.mock.calls[0]?.[0])).toContain('material_variants');
    expect(query.mock.calls[0]?.[1]).toEqual(['%m1%', '%m1%', '%m1%', '3', 'purchased', 1]);
    expect(query.mock.calls[1]?.[1]).toEqual(['%m1%', '%m1%', '%m1%', '3', 'purchased', 1, 20, 20]);
    expect(query.mock.calls[2]?.[1]).toEqual([9]);
  });

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

  it('creates a material only under an enabled material category and audits in the same transaction', async () => {
    const connection = transactionConnection();
    connection.query.mockResolvedValueOnce([[{ item_kind: 'material', status: 1 }], []]);
    connection.execute
      .mockResolvedValueOnce([{ insertId: 41, affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const repository = new MysqlMaterialRepository(pool(connection) as never);

    await expect(repository.create(payload, audit)).resolves.toEqual({ id: '41' });

    expect(connection.execute.mock.calls[0]?.[1]).toEqual([
      'm1.077.012',
      '微带',
      '3',
      'pcs',
      'purchased',
      JSON.stringify(payload.specValues),
      1,
      '基础物料',
      '7',
      '7',
    ]);
    expect(String(connection.execute.mock.calls[1]?.[0])).toContain('INSERT INTO operation_logs');
    expect(connection.execute.mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining(['business', 'product', 'material.create', '7', '41']),
    );
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });

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

  it('updates mutable material master fields while preserving code and unit', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[{ material_code: 'm1.077.012', unit: 'pcs', status: 1 }], []])
      .mockResolvedValueOnce([[{ item_kind: 'material', status: 1 }], []]);
    connection.execute
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const repository = new MysqlMaterialRepository(pool(connection) as never);

    await expect(
      repository.update('9', { ...payload, materialName: '改名后的当前名称', remark: null }, audit),
    ).resolves.toBeUndefined();

    expect(String(connection.query.mock.calls[0]?.[0])).toContain('FOR UPDATE');
    expect(connection.execute.mock.calls[0]?.[1]).toEqual([
      '改名后的当前名称',
      '3',
      'purchased',
      JSON.stringify(payload.specValues),
      1,
      null,
      '7',
      '9',
    ]);
    expect(String(connection.execute.mock.calls[1]?.[0])).toContain('INSERT INTO operation_logs');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

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
