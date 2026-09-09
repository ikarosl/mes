import { describe, expect, it, vi } from 'vitest';
import { MysqlProductionReturnRepository } from '../mysql-production-return.repository.js';

const audit = { actorId: '7', requestId: 'req-return-1', ip: null, userAgent: null };

describe('MysqlProductionReturnRepository', () => {
  it('lists only returnable allocations while preserving current names and exact variants', async () => {
    const query = vi.fn().mockResolvedValueOnce([
      [
        {
          allocation_id: 9,
          demand_id: 10,
          production_batch_id: 21,
          item_id: 5,
          material_variant_id: 6,
          batch_id: 101,
          item_code_snapshot: 'MAT-1',
          item_name: '停用后的当前名称',
          material_variant_code_snapshot: 'V-6',
          batch_code: 'B-101',
          unit_snapshot: '件',
          confirmed_quantity: '10.0000',
          occupied_quantity: '2.0000',
          occupied_loss_quantity: '1.0000',
        },
        {
          allocation_id: 10,
          demand_id: 11,
          production_batch_id: 21,
          item_id: 5,
          material_variant_id: 7,
          batch_id: 102,
          item_code_snapshot: 'MAT-1',
          item_name: '停用后的当前名称',
          material_variant_code_snapshot: 'V-7',
          batch_code: 'B-102',
          unit_snapshot: '件',
          confirmed_quantity: '1.0000',
          occupied_quantity: '1.0000',
          occupied_loss_quantity: '0.0000',
        },
      ],
      [],
    ]);
    const repository = new MysqlProductionReturnRepository({ query } as never);

    await expect(repository.listReturnCandidates('21')).resolves.toEqual([
      expect.objectContaining({
        allocationId: '9',
        materialVariantId: '6',
        itemName: '停用后的当前名称',
        confirmedOutboundQuantity: '10.0000',
        occupiedReturnQuantity: '2.0000',
        returnableQuantity: '7.0000',
      }),
    ]);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('display_material.material_name');
    expect(sql).toContain('a.material_variant_id');
    expect(sql).toContain("ro.status IN ('pending','returned')");
  });

  it('creates a pending return order, audits it transactionally, and keeps material snapshots by variant', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[{ work_order_id: 3 }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[candidateRow], []])
      .mockResolvedValueOnce([[returnOrderRow], []])
      .mockResolvedValueOnce([[], []]);
    connection.execute
      .mockResolvedValueOnce([{ insertId: 61, affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ insertId: 62, affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const repository = new MysqlProductionReturnRepository(pool as never);

    await expect(
      repository.createReturnOrder(
        {
          productionBatchId: '21',
          details: [{ allocationId: '9', returnQuantity: 3, remark: '余料' }],
          remark: '批次余料回仓',
        } as never,
        audit,
      ),
    ).resolves.toMatchObject({
      id: '61',
      status: 'pending',
      details: [],
    });

    expect(String(connection.execute.mock.calls[0]?.[0])).toContain('INSERT INTO return_order');
    expect(String(connection.execute.mock.calls[1]?.[0])).toContain('INSERT INTO return_detail');
    expect(String(connection.execute.mock.calls[2]?.[0])).toContain('INSERT INTO operation_logs');
    expect(String(connection.query.mock.calls[2]?.[0])).toContain('display_material.material_name');
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('rolls back before writing a return order when the requested amount exceeds the candidate', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[{ work_order_id: 3 }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const repository = new MysqlProductionReturnRepository(pool as never);

    await expect(
      repository.createReturnOrder(
        {
          productionBatchId: '21',
          details: [{ allocationId: '9', returnQuantity: 1 }],
        } as never,
        audit,
      ),
    ).rejects.toMatchObject({ code: 'RETURN_QUANTITY_EXCEEDED' });

    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('cancels a pending return order with a same-transaction audit', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[returnOrderRow], []])
      .mockResolvedValueOnce([
        [{ ...returnOrderRow, status: 'cancelled', cancel_reason: '重复单' }],
        [],
      ])
      .mockResolvedValueOnce([[], []]);
    connection.execute
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const pool = { getConnection: vi.fn().mockResolvedValue(connection) };
    const repository = new MysqlProductionReturnRepository(pool as never);

    await expect(repository.cancelReturnOrder('61', 0, '重复单', audit)).resolves.toMatchObject({
      id: '61',
      status: 'cancelled',
      cancelReason: '重复单',
    });
    expect(String(connection.execute.mock.calls[0]?.[0])).toContain("status='cancelled'");
    expect(String(connection.execute.mock.calls[1]?.[0])).toContain('INSERT INTO operation_logs');
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

const candidateRow = {
  allocation_id: 9,
  demand_id: 10,
  production_batch_id: 21,
  item_id: 5,
  material_variant_id: 6,
  batch_id: 101,
  item_code_snapshot: 'MAT-1',
  item_name: '停用后的当前名称',
  material_variant_code_snapshot: 'V-6',
  batch_code: 'B-101',
  unit_snapshot: '件',
  confirmed_quantity: '10.0000',
  occupied_quantity: '2.0000',
  occupied_loss_quantity: '1.0000',
};

const returnOrderRow = {
  id: 61,
  return_no: 'TL-001',
  production_batch_id: 21,
  batch_no: 'PB-021',
  work_order_id: 3,
  work_order_no: 'WO-003',
  product_code: 'FG-1',
  product_name: '成品',
  status: 'pending',
  return_at: null,
  operator_id: null,
  created_by: 7,
  created_at: new Date('2026-09-01T02:00:00.000Z'),
  version: 0,
  remark: '批次余料回仓',
  cancel_reason: null,
  cancelled_by: null,
  cancelled_at: null,
};
