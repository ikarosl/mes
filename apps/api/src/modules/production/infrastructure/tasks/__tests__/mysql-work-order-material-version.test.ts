import { describe, expect, it, vi } from 'vitest';
import { lockWorkOrderForBatch } from '../mysql-work-order-material-version.js';

describe('work-order material-version lock policy', () => {
  it('locks the work order before a batch and returns its order type', async () => {
    const connection = connectionMock();
    connection.query
      .mockResolvedValueOnce([[{ work_order_id: 20 }], []])
      .mockResolvedValueOnce([[{ id: 20, order_type: 'mass_production' }], []]);

    await expect(lockWorkOrderForBatch(connection as never, '31')).resolves.toEqual({
      workOrderId: '20',
      orderType: 'mass_production',
      productionBatchId: '31',
    });
    expect(connection.query.mock.calls[0]?.[1]).toEqual(['31']);
    expect(String(connection.query.mock.calls[0]?.[0])).toContain(
      'FROM production_batches WHERE id=?',
    );
    expect(String(connection.query.mock.calls[0]?.[0])).not.toContain('FOR UPDATE');
    expect(String(connection.query.mock.calls[1]?.[0])).toContain(
      'FROM work_orders WHERE id=? FOR UPDATE',
    );
    expect(connection.query.mock.calls[1]?.[1]).toEqual([20]);
  });

  it('rejects a missing batch or work order before selecting a version', async () => {
    const missingBatch = connectionMock();
    missingBatch.query.mockResolvedValueOnce([[], []]);
    await expect(lockWorkOrderForBatch(missingBatch as never, '31')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const missingOrder = connectionMock();
    missingOrder.query
      .mockResolvedValueOnce([[{ work_order_id: 20 }], []])
      .mockResolvedValueOnce([[], []]);
    await expect(lockWorkOrderForBatch(missingOrder as never, '31')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  // TODO(test-migration): 高重要性：版本一致性；正式测试获准后按任务锁版恢复。
  it.todo('writes the first mass-production version choice after locking the work order');

  // TODO(test-migration): 高重要性：版本一致性；正式测试获准后按任务锁版恢复。
  it.todo(
    'reuses one locked version across batches and manual additions of the same mass-production work order',
  );

  // TODO(test-migration): 高重要性：版本一致性；正式测试获准后按任务锁版恢复。
  it.todo('rejects a different version for a mass-production work order');

  // TODO(test-migration): 高重要性：版本一致性；正式测试获准后按任务锁版恢复。
  it.todo(
    'allows a research work order to select multiple versions without writing the lock table',
  );
});

const connectionMock = () => ({
  query: vi.fn(),
  execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }, []]),
});
