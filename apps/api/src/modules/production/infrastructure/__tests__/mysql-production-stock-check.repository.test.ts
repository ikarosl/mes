import { describe, expect, it, vi } from 'vitest';
import { MysqlProductionStockCheckRepository } from '../mysql-production-stock-check.repository.js';

const audit = { actorId: '7', requestId: 'req-check-1', ip: null, userAgent: null };

describe('MysqlProductionStockCheckRepository', () => {
  it('lists positive stock candidates with current names and variant-isolated ledger joins', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([
        [
          {
            item_id: 5,
            material_variant_id: 6,
            batch_id: 101,
            item_code_snapshot: 'MAT-1',
            item_name: '停用后的当前名称',
            material_variant_code_snapshot: 'V-6',
            batch_code: 'B-101',
            stock_status: 'available',
            unit_snapshot: '件',
            system_quantity: '8.0000',
          },
        ],
        [],
      ]);
    const repository = new MysqlProductionStockCheckRepository({ query } as never);

    const result = await repository.listStockCheckCandidates({
      keyword: '当前名称',
      stockStatus: 'available',
      page: 1,
      pageSize: 20,
    });

    expect(result.items[0]).toMatchObject({
      itemId: '5',
      materialVariantId: '6',
      itemName: '停用后的当前名称',
      systemQuantity: '8.0000',
    });
    const countSql = String(query.mock.calls[0]?.[0]);
    const dataSql = String(query.mock.calls[1]?.[0]);
    expect(countSql).toContain('display_material.material_name');
    expect(dataSql).toContain('display_material.material_name');
    expect(dataSql).toContain('it.material_variant_id=ib.material_variant_id');
    expect(query.mock.calls[1]?.[1]).toEqual([
      '%当前名称%',
      '%当前名称%',
      '%当前名称%',
      'available',
      20,
      0,
    ]);
  });

  it('creates a pending stock check with same-transaction audit and exact variant target snapshot', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ ...stockTarget, system_quantity: '8.0000' }], []])
      .mockResolvedValueOnce([[stockCheckRow], []])
      .mockResolvedValueOnce([[], []]);
    connection.execute
      .mockResolvedValueOnce([{ insertId: 71, affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ insertId: 72, affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const repository = new MysqlProductionStockCheckRepository(pool as never);

    await expect(
      repository.createStockCheck(
        {
          details: [{ itemBatchId: '101', stockStatus: 'available' }],
          remark: '月末盘点',
        } as never,
        audit,
      ),
    ).resolves.toMatchObject({
      id: '71',
      status: 'pending',
      detailCount: 0,
    });

    expect(String(connection.execute.mock.calls[0]?.[0])).toContain(
      'INSERT INTO stock_check_order',
    );
    expect(String(connection.execute.mock.calls[1]?.[0])).toContain(
      'INSERT INTO stock_check_detail',
    );
    expect(String(connection.execute.mock.calls[2]?.[0])).toContain('INSERT INTO operation_logs');
    expect(String(connection.query.mock.calls[1]?.[0])).toContain('ib.material_variant_id');
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('maps duplicate check numbers and rolls back the transaction', async () => {
    const connection = transactionConnection();
    connection.query.mockResolvedValueOnce([[], []]);
    const duplicate = Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
    connection.execute.mockRejectedValueOnce(duplicate);
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const repository = new MysqlProductionStockCheckRepository(pool as never);

    await expect(
      repository.createStockCheck(
        {
          checkNo: 'PD-001',
          details: [{ itemBatchId: '101', stockStatus: 'available' }],
        } as never,
        audit,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.execute).toHaveBeenCalledOnce();
  });

  it('saves counts and advances the counting version with transactional audit', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[stockCheckRow], []])
      .mockResolvedValueOnce([[stockDetailRow], []])
      .mockResolvedValueOnce([[{ ...stockCheckRow, status: 'counting', version: 1 }], []])
      .mockResolvedValueOnce([[{ ...stockDetailRow, actual_quantity: '8.0000' }], []]);
    connection.execute
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const repository = new MysqlProductionStockCheckRepository(pool as never);

    await expect(
      repository.saveStockCheckCounts(
        '71',
        { version: 0, details: [{ detailId: '72', actualQuantity: 8 }] } as never,
        audit,
      ),
    ).resolves.toMatchObject({ id: '71', status: 'counting', version: 1, pendingCount: 0 });
    expect(String(connection.query.mock.calls[1]?.[0])).toContain('display_material.material_name');
    expect(String(connection.execute.mock.calls[0]?.[0])).toContain('UPDATE stock_check_detail');
    expect(String(connection.execute.mock.calls[2]?.[0])).toContain('INSERT INTO operation_logs');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('completes a changed count by appending a stock_check_adjustment ledger fact', async () => {
    const connection = transactionConnection();
    const countingOrder = { ...stockCheckRow, status: 'counting', version: 1 };
    const countedDetail = {
      ...stockDetailRow,
      actual_quantity: '9.0000',
      difference_quantity: '1.0000',
      result: 'surplus',
    };
    connection.query
      .mockResolvedValueOnce([[countingOrder], []])
      .mockResolvedValueOnce([[countedDetail], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ quantity: '8.0000' }], []])
      .mockResolvedValueOnce([[{ ...stockCheckRow, status: 'completed', version: 2 }], []])
      .mockResolvedValueOnce([[{ ...countedDetail, adjusted: 1 }], []]);
    connection.execute
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const repository = new MysqlProductionStockCheckRepository(pool as never);

    await expect(repository.completeStockCheck('71', 1, audit)).resolves.toMatchObject({
      id: '71',
      status: 'completed',
      version: 2,
    });
    expect(String(connection.execute.mock.calls[0]?.[0])).toContain("'stock_check_adjustment'");
    expect(String(connection.execute.mock.calls[3]?.[0])).toContain('INSERT INTO operation_logs');
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
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

const stockTarget = {
  item_id: 5,
  material_variant_id: 6,
  unit_snapshot: '件',
};

const stockDetailRow = {
  id: 72,
  item_id: 5,
  material_variant_id: 6,
  batch_id: 101,
  item_code_snapshot: 'MAT-1',
  item_name: '停用后的当前名称',
  material_variant_code_snapshot: 'V-6',
  batch_code: 'B-101',
  stock_status: 'available',
  unit_snapshot: '件',
  system_quantity: '8.0000',
  actual_quantity: null,
  difference_quantity: null,
  result: null,
  adjusted: 0,
  remark: null,
};

const stockCheckRow = {
  id: 71,
  check_no: 'PD-001',
  status: 'pending',
  check_at: null,
  operator_id: null,
  created_by: 7,
  created_at: new Date('2026-09-01T02:00:00.000Z'),
  version: 0,
  remark: '月末盘点',
  cancel_reason: null,
  cancelled_by: null,
  cancelled_at: null,
};
