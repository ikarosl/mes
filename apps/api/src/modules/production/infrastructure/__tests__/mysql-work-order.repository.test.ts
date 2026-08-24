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

  it('rejects clearing required work-order plan dates', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[workOrderRow], []])
      .mockResolvedValueOnce([[workOrderRow], []])
      .mockResolvedValueOnce([[], []]);
    connection.execute.mockResolvedValue([{ affectedRows: 1 }, []]);
    const repository = new MysqlWorkOrderRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(
      repository.update(
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
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(connection.execute).not.toHaveBeenCalled();
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
      {
        workOrderNo: 'WO-001',
        productId: '8',
        plannedQuantity: 100,
        planStartDate: '2026-08-01',
        planEndDate: '2026-08-31',
      },
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
        {
          workOrderNo: 'WO-001',
          productId: '8',
          plannedQuantity: 100,
          planStartDate: '2026-08-01',
          planEndDate: '2026-08-31',
        },
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

  it('only cancels draft work orders without production batches', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[workOrderRow], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ ...workOrderRow, status: 'cancelled', version: 4 }], []])
      .mockResolvedValueOnce([[], []]);
    connection.execute.mockResolvedValue([{ affectedRows: 1 }, []]);
    const repository = new MysqlWorkOrderRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(repository.cancel('6', 3, '计划取消', audit)).resolves.toMatchObject({
      status: 'cancelled',
      version: 4,
    });

    expect(String(connection.execute.mock.calls[0]?.[0])).toContain("status='draft'");
    expect(String(connection.execute.mock.calls[0]?.[0])).toContain('cancel_reason=?');
    expect(connection.execute.mock.calls[0]?.[1]).toEqual(['计划取消', '1', '1', '6', 3]);
    expect(String(connection.execute.mock.calls[1]?.[0])).toContain('INSERT INTO operation_logs');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('does not treat cancellation as an early-close shortcut after release', async () => {
    const connection = transactionConnection();
    connection.query.mockResolvedValueOnce([[{ ...workOrderRow, status: 'released' }], []]);
    const repository = new MysqlWorkOrderRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(repository.cancel('6', 3, '计划取消', audit)).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('completes only after all active batches finish the exact planned quantity', async () => {
    const releasedOrder = { ...workOrderRow, status: 'released', version: 3 };
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[releasedOrder], []])
      .mockResolvedValueOnce([
        [
          {
            id: 21,
            batch_no: 'B-001',
            status: 'completed',
            planned_quantity: '60.0000',
            completed_quantity: '60.0000',
          },
          {
            id: 22,
            batch_no: 'B-002',
            status: 'completed',
            planned_quantity: '40.0000',
            completed_quantity: '40.0000',
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([[{ ...releasedOrder, status: 'completed', version: 4 }], []])
      .mockResolvedValueOnce([[], []]);
    connection.execute.mockResolvedValue([{ affectedRows: 1 }, []]);
    const repository = new MysqlWorkOrderRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(repository.complete('6', 3, audit)).resolves.toMatchObject({
      status: 'completed',
      version: 4,
    });

    expect(String(connection.execute.mock.calls[0]?.[0])).toContain("status='completed'");
    expect(String(connection.execute.mock.calls[1]?.[0])).toContain('INSERT INTO operation_logs');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('returns unfinished batch details instead of completing the work order', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[{ ...workOrderRow, status: 'doing' }], []])
      .mockResolvedValueOnce([
        [
          {
            id: 21,
            batch_no: 'B-001',
            status: 'doing',
            planned_quantity: '100.0000',
            completed_quantity: '80.0000',
          },
        ],
        [],
      ]);
    const repository = new MysqlWorkOrderRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(repository.complete('6', 3, audit)).rejects.toMatchObject({
      code: 'WORK_ORDER_COMPLETION_NOT_ALLOWED',
      details: {
        plannedQuantity: '100.0000',
        completedQuantity: '80.0000',
        unfinishedBatches: [{ id: '21', batchNo: 'B-001', status: 'doing' }],
      },
    });
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('requires an early-close reason and rejects unfinished batches', async () => {
    const repositoryForReason = new MysqlWorkOrderRepository({
      getConnection: vi.fn().mockResolvedValue(
        transactionConnectionWithQueries([
          [[{ ...workOrderRow, status: 'released' }], []],
          [[], []],
        ]),
      ),
    } as never);
    await expect(repositoryForReason.close('6', 3, null, audit)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });

    const unfinishedConnection = transactionConnectionWithQueries([
      [[{ ...workOrderRow, status: 'doing' }], []],
      [
        [
          {
            id: 21,
            batch_no: 'B-001',
            status: 'doing',
            planned_quantity: '100.0000',
            completed_quantity: '20.0000',
          },
        ],
        [],
      ],
    ]);
    const repositoryForBatches = new MysqlWorkOrderRepository({
      getConnection: vi.fn().mockResolvedValue(unfinishedConnection),
    } as never);
    await expect(repositoryForBatches.close('6', 3, '需求终止', audit)).rejects.toMatchObject({
      code: 'WORK_ORDER_CLOSE_NOT_ALLOWED',
      details: { unfinishedBatches: [{ id: '21', batchNo: 'B-001', status: 'doing' }] },
    });
    expect(unfinishedConnection.execute).not.toHaveBeenCalled();
  });

  it('persists the close classification, reason, actor and timestamp in the work order', async () => {
    const doingOrder = { ...workOrderRow, status: 'doing', version: 3 };
    const closedOrder = {
      ...doingOrder,
      status: 'closed',
      version: 4,
      close_type: 'underproduced',
      close_reason: '需求终止',
      closed_by: 1,
      closed_at: new Date('2026-08-02T00:00:00.000Z'),
    };
    const connection = transactionConnectionWithQueries([
      [[doingOrder], []],
      [
        [
          {
            id: 21,
            batch_no: 'B-001',
            status: 'completed',
            planned_quantity: '60.0000',
            completed_quantity: '60.0000',
          },
        ],
        [],
      ],
      [[closedOrder], []],
      [[], []],
    ]);
    connection.execute.mockResolvedValue([{ affectedRows: 1 }, []]);
    const repository = new MysqlWorkOrderRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(repository.close('6', 3, '需求终止', audit)).resolves.toMatchObject({
      status: 'closed',
      closeType: 'underproduced',
      closeReason: '需求终止',
      closedBy: '1',
    });

    expect(String(connection.execute.mock.calls[0]?.[0])).toContain('close_type=?');
    expect(connection.execute.mock.calls[0]?.[1]).toEqual([
      'underproduced',
      '需求终止',
      '1',
      '1',
      '6',
      'doing',
      3,
    ]);
    expect(String(connection.execute.mock.calls[1]?.[0])).toContain('INSERT INTO operation_logs');
    expect(connection.commit).toHaveBeenCalledOnce();
  });
});

describe('MysqlWorkOrderRepository work-order options', () => {
  it('returns released or doing work orders that still have remaining quantity', async () => {
    const query = vi.fn().mockResolvedValue([[], []]);
    const repository = new MysqlWorkOrderRepository({ query } as never);

    await repository.listWorkOrderOptions();

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('FROM work_orders wo');
    expect(sql).toContain("wo.status IN ('released','doing')");
    expect(sql).toContain('> 0');
  });

  it('maps the product snapshot and remaining quantity to WorkOrderOption', async () => {
    const query = vi.fn().mockResolvedValue([[optionRow], []]);
    const repository = new MysqlWorkOrderRepository({ query } as never);

    await expect(repository.listWorkOrderOptions()).resolves.toEqual([
      {
        id: '6',
        workOrderNo: 'WO-001',
        productId: '8',
        productCode: 'P-001',
        productName: 'Product A',
        remainingQuantity: '50.0000',
        planStartDate: '2026-08-01',
        planEndDate: '2026-08-31',
      },
    ]);
  });

  it('sums planned quantity only from non-cancelled batches of the same work order', async () => {
    const query = vi.fn().mockResolvedValue([[], []]);
    const repository = new MysqlWorkOrderRepository({ query } as never);

    await repository.listWorkOrderOptions();

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('SELECT SUM(b.planned_quantity)');
    expect(sql).toContain('b.work_order_id=wo.id');
    expect(sql).toContain("b.status<>'cancelled'");
  });

  it('returns the complete candidate set without a keyword window or a hidden limit', async () => {
    const query = vi.fn().mockResolvedValue([[], []]);
    const repository = new MysqlWorkOrderRepository({ query } as never);

    await repository.listWorkOrderOptions();

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).not.toContain('LIMIT');
    expect(sql).not.toContain('LIKE');
    expect(sql).toContain('ORDER BY wo.work_order_no ASC,wo.id ASC');
    expect(query.mock.calls[0]?.[1]).toBeUndefined();
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

const transactionConnectionWithQueries = (results: unknown[]) => {
  const connection = transactionConnection();
  for (const result of results) connection.query.mockResolvedValueOnce(result);
  return connection;
};

const audit = { actorId: '1', ip: null, requestId: 'test-request', userAgent: null };

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
  cancel_reason: null,
  cancelled_by: null,
  cancelled_at: null,
  close_type: null,
  close_reason: null,
  closed_by: null,
  closed_at: null,
  customer_name: 'Customer A',
  quality_level: 'A',
  work_order_owner_id: 9,
  plan_start_date: new Date('2026-07-31T16:00:00.000Z'),
  plan_end_date: new Date('2026-08-30T16:00:00.000Z'),
  external_order_no: 'EXT-001',
  remark: 'existing remark',
  version: 3,
  created_at: new Date('2026-08-01T00:00:00.000Z'),
  updated_at: new Date('2026-08-01T00:00:00.000Z'),
};

const optionRow = {
  id: 6,
  work_order_no: 'WO-001',
  product_id: 8,
  product_code_snapshot: 'P-001',
  product_name_snapshot: 'Product A',
  remaining_quantity: '50.0000',
  plan_start_date: '2026-08-01',
  plan_end_date: '2026-08-31',
};
