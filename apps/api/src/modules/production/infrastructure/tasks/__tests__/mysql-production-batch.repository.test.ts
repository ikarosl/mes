import { describe, expect, it, vi } from 'vitest';
import { MysqlProductionBatchRepository } from '../mysql-production-batch.repository.js';

describe('MysqlProductionBatchRepository persistence', () => {
  it('does not join Identity tables when listing batches', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ total: 0 }], []])
      .mockResolvedValueOnce([[], []]);
    const repository = new MysqlProductionBatchRepository({ query } as never, {} as never);

    await repository.list({});

    expect(String(query.mock.calls[1]?.[0])).not.toMatch(/\busers\b/i);
  });

  // TODO(test-migration): 高重要性：任务创建及取消事务；正式测试获准后按自动编号和公共单据恢复。
  it.todo('opens the batch-creation transaction before invoking route snapshot orchestration');

  // TODO(test-migration): 高重要性：任务创建及取消事务；正式测试获准后按自动编号和公共单据恢复。
  it.todo('locks capacity inputs and persists route and step snapshots before its success audit');

  it('rolls back and does not audit a stale batch update', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[batchRow], []])
      .mockResolvedValueOnce([[releasedWorkOrder], []])
      .mockResolvedValueOnce([[batchRow], []]);
    connection.execute.mockResolvedValueOnce([{ affectedRows: 0 }, []]);
    const repository = new MysqlProductionBatchRepository(
      {
        getConnection: vi.fn().mockResolvedValue(connection),
      } as never,
      {} as never,
    );

    await expect(repository.update('21', { version: 2 }, audit)).rejects.toMatchObject({
      code: 'CONCURRENT_MODIFICATION',
    });

    expect(String(connection.query.mock.calls[1]?.[0])).toContain('FOR UPDATE');
    expect(String(connection.query.mock.calls[2]?.[0])).toContain('FOR UPDATE');
    expect(connection.execute).toHaveBeenCalledOnce();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  // TODO(test-migration): 高重要性：任务创建及取消事务；正式测试获准后按自动编号和公共单据恢复。
  it.todo('rejects creation dates outside the locked work-order plan window');

  it('rejects update dates outside the locked work-order plan window', async () => {
    const connection = transactionConnection();
    connection.query
      .mockResolvedValueOnce([[batchRow], []])
      .mockResolvedValueOnce([[releasedWorkOrder], []])
      .mockResolvedValueOnce([[batchRow], []]);
    const repository = new MysqlProductionBatchRepository(
      {
        getConnection: vi.fn().mockResolvedValue(connection),
      } as never,
      {} as never,
    );

    await expect(
      repository.update('21', { version: 2, planEndDate: '2026-09-01' }, audit),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
  });

  // TODO(test-migration): 高重要性：任务创建及取消事务；正式测试获准后按自动编号和公共单据恢复。
  it.todo('previews every side effect before a pre-start cancellation');

  // TODO(test-migration): 高重要性：任务创建及取消事务；正式测试获准后按自动编号和公共单据恢复。
  it.todo('blocks cancellation when material has already been outbound');

  // TODO(test-migration): 高重要性：任务创建及取消事务；正式测试获准后按自动编号和公共单据恢复。
  it.todo('cancels pending outbounds, allocations, demands and the batch in one transaction');

  // TODO(test-migration): 高重要性：任务创建及取消事务；正式测试获准后按自动编号和公共单据恢复。
  it.todo('forbids cancelling a task after material outbound or production start');
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
  closeout_mode: null,
  current_revision_id: null,
  execution_completed_at: null,
  execution_completed_by: null,
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
