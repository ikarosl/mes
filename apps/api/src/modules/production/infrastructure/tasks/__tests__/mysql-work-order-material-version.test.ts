import { describe, expect, it, vi } from 'vitest';
import {
  lockWorkOrderForBatch,
  requireWorkOrderMaterialVariant,
} from '../mysql-work-order-material-version.js';

describe('work-order material-version lock policy', () => {
  it('locks the work order before a batch and returns its order type', async () => {
    const connection = connectionMock();
    connection.query
      .mockResolvedValueOnce([[{ work_order_id: 20 }], []])
      .mockResolvedValueOnce([[{ id: 20, order_type: 'mass_production' }], []]);

    await expect(lockWorkOrderForBatch(connection as never, '31')).resolves.toEqual({
      workOrderId: '20',
      orderType: 'mass_production',
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

  it('writes the first mass-production version choice after locking the work order', async () => {
    const connection = connectionMock();
    connection.query.mockResolvedValueOnce([[], []]);

    await expect(
      requireWorkOrderMaterialVariant(
        connection as never,
        { workOrderId: '20', orderType: 'mass_production' },
        '5',
        '101',
        '7',
      ),
    ).resolves.toBeUndefined();

    expect(String(connection.query.mock.calls[0]?.[0])).toContain(
      'FROM work_order_material_versions',
    );
    expect(String(connection.query.mock.calls[0]?.[0])).toContain('FOR UPDATE');
    expect(connection.query.mock.calls[0]?.[1]).toEqual(['20', '5']);
    expect(connection.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO work_order_material_versions'),
      ['20', '5', '101', '7'],
    );
  });

  it('reuses one locked version across batches and manual additions of the same mass-production work order', async () => {
    const connection = connectionMock();
    connection.query
      .mockResolvedValueOnce([[{ material_variant_id: 101 }], []])
      .mockResolvedValueOnce([[{ material_variant_id: 101 }], []]);
    const policy = { workOrderId: '20', orderType: 'mass_production' as const };

    await requireWorkOrderMaterialVariant(connection as never, policy, '5', '101', '7');
    await requireWorkOrderMaterialVariant(connection as never, policy, '5', '101', '8');

    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.query).toHaveBeenCalledTimes(2);
  });

  it('rejects a different version for a mass-production work order', async () => {
    const connection = connectionMock();
    connection.query.mockResolvedValueOnce([[{ material_variant_id: 101 }], []]);

    await expect(
      requireWorkOrderMaterialVariant(
        connection as never,
        { workOrderId: '20', orderType: 'mass_production' },
        '5',
        '102',
        '7',
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringContaining('已锁定'),
    });
    expect(connection.execute).not.toHaveBeenCalled();
  });

  it('allows a research work order to select multiple versions without writing the lock table', async () => {
    const connection = connectionMock();

    await requireWorkOrderMaterialVariant(
      connection as never,
      { workOrderId: '20', orderType: 'research' },
      '5',
      '101',
      '7',
    );
    await requireWorkOrderMaterialVariant(
      connection as never,
      { workOrderId: '20', orderType: 'research' },
      '5',
      '102',
      '7',
    );

    expect(connection.query).not.toHaveBeenCalled();
    expect(connection.execute).not.toHaveBeenCalled();
  });
});

const connectionMock = () => ({
  query: vi.fn(),
  execute: vi.fn().mockResolvedValue([{ affectedRows: 1 }, []]),
});
