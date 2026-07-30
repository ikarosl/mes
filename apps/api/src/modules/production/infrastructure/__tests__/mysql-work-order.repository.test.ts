import { describe, expect, it, vi } from 'vitest';
import { MysqlWorkOrderRepository } from '../mysql-work-order.repository.js';

describe('MysqlWorkOrderRepository data ownership', () => {
  it('reads a work-order product id only from Production-owned data', async () => {
    const query = vi.fn().mockResolvedValue([[{ product_id: 8 }], []]);
    const repository = new MysqlWorkOrderRepository({ query } as never);

    await expect(repository.getProductId('6')).resolves.toBe('8');

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('FROM work_orders');
    expect(sql).not.toContain('products');
  });

  it('persists explicit nulls when clearing optional work-order fields', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[workOrderRow], []])
      .mockResolvedValueOnce([[workOrderRow], []])
      .mockResolvedValueOnce([[], []]);
    connection.execute.mockResolvedValue([{ affectedRows: 1 }, []]);
    const repository = new MysqlWorkOrderRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await repository.update(
      '6',
      {
        version: 3,
        customerName: null,
        qualityLevel: null,
        workOrderOwnerId: null,
        planStartDate: null,
        planEndDate: null,
        externalOrderNo: null,
        remark: null,
      },
      undefined,
      { actorId: '1', ip: null, requestId: 'test-request', userAgent: null },
    );

    expect(connection.execute.mock.calls[0]?.[1]).toEqual([
      8,
      'P-001',
      'Product A',
      'pcs',
      '100.0000',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      '1',
      '6',
      3,
    ]);
  });

  it('retains optional values omitted from a work-order update', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[workOrderRow], []])
      .mockResolvedValueOnce([[workOrderRow], []])
      .mockResolvedValueOnce([[], []]);
    connection.execute.mockResolvedValue([{ affectedRows: 1 }, []]);
    const repository = new MysqlWorkOrderRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await repository.update('6', { version: 3 }, undefined, {
      actorId: '1',
      ip: null,
      requestId: 'test-request',
      userAgent: null,
    });

    expect(connection.execute.mock.calls[0]?.[1]).toEqual([
      8,
      'P-001',
      'Product A',
      'pcs',
      '100.0000',
      'Customer A',
      'A',
      9,
      '2026-08-01',
      '2026-08-31',
      'EXT-001',
      'existing remark',
      '1',
      '6',
      3,
    ]);
  });

  it('locks a draft work order before invoking release-time product validation', async () => {
    const connection = transactionConnection();
    connection.query.mockResolvedValueOnce([[workOrderRow], []]);
    const repository = new MysqlWorkOrderRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);
    const action = vi.fn().mockResolvedValue('validated');

    await expect(repository.withReleaseTransaction('6', action)).resolves.toBe('validated');

    expect(action).toHaveBeenCalledWith('8');
    expect(String(connection.query.mock.calls[0]?.[0])).toContain('FOR UPDATE');
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('freezes the current product snapshot, release state and audit in one transaction', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[workOrderRow], []])
      .mockResolvedValueOnce([[{ ...workOrderRow, status: 'released', version: 4 }], []])
      .mockResolvedValueOnce([[], []]);
    connection.execute
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const repository = new MysqlWorkOrderRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await repository.release(
      '6',
      3,
      {
        id: '8',
        itemCode: 'FG-002',
        productName: 'Current finished good',
        unit: 'box',
        defaultRouteId: null,
      },
      { actorId: '1', ip: null, requestId: 'test-request', userAgent: null },
    );

    expect(String(connection.query.mock.calls[0]?.[0])).toContain('FOR UPDATE');
    expect(String(connection.execute.mock.calls[0]?.[0])).toContain('product_code_snapshot=?');
    expect(String(connection.execute.mock.calls[0]?.[0])).toContain("status='released'");
    expect(connection.execute.mock.calls[0]?.[1]).toEqual([
      '8',
      'FG-002',
      'Current finished good',
      'box',
      '1',
      '6',
      3,
    ]);
    expect(String(connection.execute.mock.calls[1]?.[0])).toContain('INSERT INTO operation_logs');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('writes a successful work-order audit through the same transaction connection', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[workOrderRow], []])
      .mockResolvedValueOnce([[], []]);
    connection.execute
      .mockResolvedValueOnce([{ insertId: 6, affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const repository = new MysqlWorkOrderRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await repository.create(
      { workOrderNo: 'WO-001', productId: '8', plannedQuantity: 100 },
      { id: '8', itemCode: 'P-001', productName: 'Product A', unit: 'pcs', defaultRouteId: null },
      { actorId: '1', ip: null, requestId: 'test-request', userAgent: null },
    );

    expect(String(connection.execute.mock.calls[0]?.[0])).toContain('INSERT INTO work_orders');
    expect(String(connection.execute.mock.calls[1]?.[0])).toContain('INSERT INTO operation_logs');
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('rolls back the work-order insert when the transactional audit cannot be written', async () => {
    const connection = transactionConnection();
    connection.query.mockResolvedValueOnce([[], []]);
    connection.execute
      .mockResolvedValueOnce([{ insertId: 6, affectedRows: 1 }, []])
      .mockRejectedValueOnce(new Error('audit unavailable'));
    const repository = new MysqlWorkOrderRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(
      repository.create(
        { workOrderNo: 'WO-001', productId: '8', plannedQuantity: 100 },
        {
          id: '8',
          itemCode: 'P-001',
          productName: 'Product A',
          unit: 'pcs',
          defaultRouteId: null,
        },
        { actorId: '1', ip: null, requestId: 'test-request', userAgent: null },
      ),
    ).rejects.toThrow('audit unavailable');

    expect(String(connection.execute.mock.calls[1]?.[0])).toContain('INSERT INTO operation_logs');
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('rolls back and does not audit a stale work-order update', async () => {
    const connection = transactionConnection();
    connection.query.mockResolvedValueOnce([[workOrderRow], []]);
    connection.execute.mockResolvedValueOnce([{ affectedRows: 0 }, []]);
    const repository = new MysqlWorkOrderRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(
      repository.update('6', { version: 3 }, undefined, {
        actorId: '1',
        ip: null,
        requestId: 'test-request',
        userAgent: null,
      }),
    ).rejects.toMatchObject({
      code: 'CONCURRENT_MODIFICATION',
    });

    expect(connection.execute).toHaveBeenCalledOnce();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('updates a draft product snapshot and planned quantity atomically', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[workOrderRow], []])
      .mockResolvedValueOnce([[workOrderRow], []])
      .mockResolvedValueOnce([[], []]);
    connection.execute.mockResolvedValue([{ affectedRows: 1 }, []]);
    const repository = new MysqlWorkOrderRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await repository.update(
      '6',
      { version: 3, productId: '10', plannedQuantity: 12.5 },
      {
        id: '10',
        itemCode: 'FG-010',
        productName: 'Replacement product',
        unit: 'box',
        defaultRouteId: null,
      },
      { actorId: '1', ip: null, requestId: 'test-request', userAgent: null },
    );

    expect(String(connection.execute.mock.calls[0]?.[0])).toContain('product_id=?');
    expect(connection.execute.mock.calls[0]?.[1]).toEqual([
      '10',
      'FG-010',
      'Replacement product',
      'box',
      12.5,
      'Customer A',
      'A',
      9,
      '2026-08-01',
      '2026-08-31',
      'EXT-001',
      'existing remark',
      '1',
      '6',
      3,
    ]);
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

const workOrderRow = {
  id: 6,
  work_order_no: 'WO-001',
  product_id: 8,
  product_code_snapshot: 'P-001',
  product_name_snapshot: 'Product A',
  unit_snapshot: 'pcs',
  planned_quantity: '100.0000',
  assigned_quantity: '0.0000',
  status: 'draft',
  released_at: null,
  customer_name: 'Customer A',
  quality_level: 'A',
  work_order_owner_id: 9,
  plan_start_date: '2026-08-01',
  plan_end_date: '2026-08-31',
  external_order_no: 'EXT-001',
  remark: 'existing remark',
  version: 3,
  created_at: new Date('2026-08-01T00:00:00.000Z'),
  updated_at: new Date('2026-08-01T00:00:00.000Z'),
};
