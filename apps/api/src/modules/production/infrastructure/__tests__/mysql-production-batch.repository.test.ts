import { describe, expect, it, vi } from 'vitest';
import { MysqlProductionBatchRepository } from '../mysql-production-batch.repository.js';

describe('MysqlProductionBatchRepository persistence', () => {
  it('does not join Identity tables when listing batches', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 0 }], []])
      .mockResolvedValueOnce([[], []]);
    const repository = new MysqlProductionBatchRepository({ query } as never);

    await repository.list({});

    expect(String(query.mock.calls[1]?.[0])).not.toMatch(/\busers\b/i);
  });

  it('opens the batch-creation transaction before invoking route snapshot orchestration', async () => {
    const connection = transactionConnection();
    connection.query.mockResolvedValueOnce([[releasedWorkOrder], []]);
    const repository = new MysqlProductionBatchRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);
    const action = vi.fn().mockResolvedValue('created');

    await expect(repository.withBatchCreationTransaction('6', action)).resolves.toBe('created');

    expect(action).toHaveBeenCalledWith('8');
    expect(String(connection.query.mock.calls[0]?.[0])).toContain('FOR UPDATE');
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('locks capacity inputs and persists route and step snapshots before its success audit', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[releasedWorkOrder], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ quantity: '0.0000' }], []])
      .mockResolvedValueOnce([[batchRow], []])
      .mockResolvedValueOnce([[], []]);
    connection.execute
      .mockResolvedValueOnce([{ insertId: 21, affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const repository = new MysqlProductionBatchRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await repository.create(
      '6',
      { batchNo: 'B-001', plannedQuantity: 10 },
      routeSnapshot as never,
      [
        {
          routeStepId: '301',
          actualSop: {
            id: '502',
            fileName: 'actual.pdf',
            objectKey: 'sop/actual.pdf',
            versionNo: 'v2',
          },
        },
      ],
      audit,
    );

    for (const call of connection.query.mock.calls.slice(0, 3)) {
      expect(String(call[0])).toContain('FOR UPDATE');
    }
    const stepValues = connection.execute.mock.calls[1]?.[1] as unknown[];
    expect(stepValues.slice(0, 16)).toEqual([
      21,
      '301',
      1,
      'CUT',
      'Cutting',
      '501',
      'default.pdf',
      'sop/default.pdf',
      'v1',
      '7',
      null,
      '502',
      'actual.pdf',
      'sop/actual.pdf',
      'v2',
      1,
    ]);
    expect(String(connection.execute.mock.calls[2]?.[0])).toContain('INSERT INTO operation_logs');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('rolls back and does not audit a stale batch update', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[batchRow], []])
      .mockResolvedValueOnce([[releasedWorkOrder], []])
      .mockResolvedValueOnce([[batchRow], []]);
    connection.execute.mockResolvedValueOnce([{ affectedRows: 0 }, []]);
    const repository = new MysqlProductionBatchRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(repository.update('21', { version: 2 }, audit)).rejects.toMatchObject({
      code: 'CONCURRENT_MODIFICATION',
    });

    expect(String(connection.query.mock.calls[1]?.[0])).toContain('FOR UPDATE');
    expect(String(connection.query.mock.calls[2]?.[0])).toContain('FOR UPDATE');
    expect(connection.execute).toHaveBeenCalledOnce();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('rejects creation dates outside the locked work-order plan window', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[releasedWorkOrder], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ quantity: '0.0000' }], []]);
    const repository = new MysqlProductionBatchRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(
      repository.create(
        '6',
        {
          batchNo: 'B-001',
          plannedQuantity: 10,
          planStartDate: '2026-07-31',
          planEndDate: '2026-08-31',
        },
        null,
        [],
        audit,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('rejects update dates outside the locked work-order plan window', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[batchRow], []])
      .mockResolvedValueOnce([[releasedWorkOrder], []])
      .mockResolvedValueOnce([[batchRow], []]);
    const repository = new MysqlProductionBatchRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(
      repository.update('21', { version: 2, planEndDate: '2026-09-01' }, audit),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('writes integer material-demand snapshots and stable idempotency keys', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[batchRow], []])
      .mockResolvedValueOnce([[{ ...batchRow, status: 'material_pending' }], []])
      .mockResolvedValueOnce([[], []]);
    connection.execute.mockResolvedValue([{ affectedRows: 1 }, []]);
    const repository = new MysqlProductionBatchRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await repository.generateMaterialDemands(
      '21',
      2,
      {
        product: { id: '8' },
        lines: [
          {
            productMaterialId: '401',
            materialProductId: '402',
            quantityPerUnit: '2.0000',
            unit: 'kg',
            isKeyMaterial: true,
            needBatchRecord: false,
          },
        ],
      } as never,
      audit,
    );

    const demandValues = connection.execute.mock.calls[0]?.[1] as unknown[];
    expect(demandValues.slice(0, 12)).toEqual([
      '21',
      '401',
      '402',
      '2.0000',
      'kg',
      1,
      0,
      '10.0000',
      '20.0000',
      'normal',
      'NORMAL:21:401',
      '1',
    ]);
    expect(String(connection.execute.mock.calls[2]?.[0])).toContain('INSERT INTO operation_logs');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('does not create a second material demand after the batch reaches material_pending', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[{ ...batchRow, status: 'material_pending' }], []])
      .mockResolvedValueOnce([[{ ...batchRow, status: 'material_pending' }], []])
      .mockResolvedValueOnce([[], []]);
    const repository = new MysqlProductionBatchRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await repository.generateMaterialDemands(
      '21',
      2,
      { product: { id: '8' }, lines: [] } as never,
      audit,
    );

    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('previews every side effect before a pre-start cancellation', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ ...batchRow, status: 'material_assigned' }], []])
      .mockResolvedValueOnce([
        [[{ id: 31, outbound_no: 'OUT-001', status: 'pending_picking' }][0]],
        [],
      ])
      .mockResolvedValueOnce([[{ id: 41 }, { id: 42 }], []])
      .mockResolvedValueOnce([[{ id: 51 }], []]);
    const repository = new MysqlProductionBatchRepository({ query } as never);

    await expect(repository.getCancellationCheck('21')).resolves.toEqual({
      productionBatchId: '21',
      batchStatus: 'material_assigned',
      version: 2,
      canCancel: true,
      blockers: [],
      activeDemandCount: 1,
      activeAllocationCount: 2,
      pendingOutboundCount: 1,
      pendingOutbounds: [{ id: '31', outboundNo: 'OUT-001' }],
    });
  });

  it('blocks cancellation when material has already been outbound', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[{ ...batchRow, status: 'material_assigned' }], []])
      .mockResolvedValueOnce([[{ id: 31, outbound_no: 'OUT-001', status: 'completed' }], []])
      .mockResolvedValueOnce([[{ id: 41 }], []])
      .mockResolvedValueOnce([[{ id: 51 }], []]);
    const repository = new MysqlProductionBatchRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(repository.cancel('21', 2, '计划调整', audit)).rejects.toMatchObject({
      code: 'BATCH_CANCEL_NOT_ALLOWED',
      details: {
        outbounds: [{ id: '31', outboundNo: 'OUT-001', status: 'completed' }],
      },
    });

    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  it('cancels pending outbounds, allocations, demands and the batch in one transaction', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[{ ...batchRow, status: 'material_assigned' }], []])
      .mockResolvedValueOnce([[{ id: 31, outbound_no: 'OUT-001', status: 'pending_picking' }], []])
      .mockResolvedValueOnce([[{ id: 41 }, { id: 42 }], []])
      .mockResolvedValueOnce([[{ id: 51 }], []])
      .mockResolvedValueOnce([[{ ...batchRow, status: 'cancelled', version: 3 }], []])
      .mockResolvedValueOnce([[], []]);
    connection.execute.mockResolvedValue([{ affectedRows: 1 }, []]);
    const repository = new MysqlProductionBatchRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never);

    await expect(repository.cancel('21', 2, '计划调整', audit)).resolves.toMatchObject({
      status: 'cancelled',
      version: 3,
    });

    const mutationSql = connection.execute.mock.calls
      .slice(0, 4)
      .map((call) => String(call[0]))
      .join('\n');
    expect(mutationSql).toContain('outbound_order');
    expect(mutationSql).toContain("status='pending_picking'");
    expect(mutationSql).toContain('production_item_allocation');
    expect(mutationSql).toContain('production_item_demand');
    expect(mutationSql).toContain("status IN ('pending','material_pending','material_assigned')");
    expect(mutationSql).toContain('cancel_reason=?');
    expect(connection.execute.mock.calls[3]?.[1]).toEqual(['计划调整', '1', '1', '21', 2]);
    expect(String(connection.execute.mock.calls[4]?.[0])).toContain('INSERT INTO operation_logs');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('forbids cancelling a task after material outbound or production start', async () => {
    for (const status of ['material_outbound', 'doing'] as const) {
      const connection = transactionConnection();
      connection.query.mockResolvedValueOnce([[{ ...batchRow, status }], []]);
      const repository = new MysqlProductionBatchRepository({
        getConnection: vi.fn().mockResolvedValue(connection),
      } as never);

      await expect(repository.cancel('21', 2, '计划调整', audit)).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });
      expect(connection.execute).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledOnce();
    }
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

const audit = { actorId: '1', ip: null, requestId: 'test-request', userAgent: null };
const releasedWorkOrder = {
  id: 6,
  product_id: 8,
  planned_quantity: '100.0000',
  unit_snapshot: 'pcs',
  status: 'released',
  plan_start_date: new Date('2026-07-31T16:00:00.000Z'),
  plan_end_date: new Date('2026-08-30T16:00:00.000Z'),
};
const batchRow = {
  id: 21,
  work_order_id: 6,
  work_order_no: 'WO-001',
  product_id: 8,
  product_code_snapshot: 'P-001',
  product_name_snapshot: 'Product A',
  batch_no: 'B-001',
  route_id: 12,
  route_code_snapshot: 'R-001',
  route_version_snapshot: 'v1',
  planned_quantity: '10.0000',
  completed_quantity: '0.0000',
  qualified_quantity: '0.0000',
  plan_start_date: null,
  plan_end_date: null,
  status: 'pending',
  owner_id: null,
  completed_at: null,
  started_at: null,
  completed_by: null,
  cancel_reason: null,
  cancelled_by: null,
  cancelled_at: null,
  remark: null,
  version: 2,
  created_at: new Date('2026-08-01T00:00:00.000Z'),
  updated_at: new Date('2026-08-01T00:00:00.000Z'),
};
const routeSnapshot = {
  id: '12',
  routeCode: 'R-001',
  versionNo: 'v1',
  product: { id: '8' },
  steps: [
    {
      routeStepId: '301',
      stepOrder: 1,
      stepCode: 'CUT',
      stepName: 'Cutting',
      defaultOwnerId: '7',
      needRecord: true,
      needInspection: false,
      sop: {
        id: '501',
        fileName: 'default.pdf',
        objectKey: 'sop/default.pdf',
        versionNo: 'v1',
      },
    },
  ],
};
