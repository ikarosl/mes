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
  // TODO(production-test-recovery): 验证草稿创建的资格核验与写入同事务，独立下达先锁工单及任务再读取路线快照；高重要性：事务与锁序，旧创建快照夹具已失效且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按草稿创建及下达契约恢复。

  // TODO(test-migration): 高重要性：任务创建及取消事务；正式测试获准后按自动编号和公共单据恢复。
  // TODO(production-test-recovery): 验证下达锁定工单和草稿、一次保存路线工序快照及成功审计；高重要性：快照与事务原子性，旧创建快照及容量拒绝行为已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按独立下达契约恢复。

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
  // TODO(production-test-recovery): rejects creation dates outside the locked work-order plan window；高重要性覆盖，旧结构或夹具已失效且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按当前所有者契约恢复。

  // TODO(production-draft-plan-window): 验证草稿日期不越过锁定工单区间，失败不写任务或成功审计；高重要性：排程与事务边界，下达后修改日期的旧行为已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按草稿可编辑、已下达仅数量和负责人的边界恢复。

  // TODO(test-migration): 高重要性：任务创建及取消事务；正式测试获准后按自动编号和公共单据恢复。
  // TODO(production-test-recovery): previews every side effect before a pre-start cancellation；高重要性覆盖，旧结构或夹具已失效且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按当前所有者契约恢复。

  // TODO(test-migration): 高重要性：任务创建及取消事务；正式测试获准后按自动编号和公共单据恢复。
  // TODO(production-test-recovery): blocks cancellation when material has already been outbound；高重要性覆盖，旧结构或夹具已失效且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按当前所有者契约恢复。

  // TODO(test-migration): 高重要性：任务创建及取消事务；正式测试获准后按自动编号和公共单据恢复。
  // TODO(production-test-recovery): cancels pending outbounds, allocations, demands and the batch in one transaction；高重要性覆盖，旧结构或夹具已失效且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按当前所有者契约恢复。

  // TODO(test-migration): 高重要性：任务创建及取消事务；正式测试获准后按自动编号和公共单据恢复。
  // TODO(production-test-recovery): forbids cancelling a task after material outbound or production start；高重要性覆盖，旧结构或夹具已失效且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按当前所有者契约恢复。
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
