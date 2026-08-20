import { describe, expect, it, vi } from 'vitest';
import { ProductionInventoryService } from '../production-inventory.service.js';

const context = {
  actorId: '1',
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  ip: null,
  userAgent: null,
  idempotencyKey: 'test-key',
};

const idempotency = {
  execute: vi.fn(async ({ handler }) => ({ result: await handler(), replayed: false })),
};

describe('ProductionInventoryService', () => {
  it('normalizes a return order and enriches audit user snapshots', async () => {
    const repository = {
      createReturnOrder: vi.fn().mockResolvedValue({
        id: '4',
        operatorId: null,
        createdById: '1',
      }),
    };
    const identity = {
      listUserReferencesByIds: vi.fn().mockResolvedValue([{ id: '1', displayName: '管理员' }]),
    };
    const service = new ProductionInventoryService(
      repository as never,
      identity as never,
      idempotency as never,
    );

    const result = await service.createReturnOrder(
      {
        productionBatchId: '8',
        remark: ' 余料退回 ',
        details: [{ allocationId: '10', returnQuantity: 2, remark: ' 完好 ' }],
      },
      context,
    );

    expect(repository.createReturnOrder).toHaveBeenCalledWith(
      {
        productionBatchId: '8',
        remark: '余料退回',
        details: [{ allocationId: '10', returnQuantity: 2, remark: '完好' }],
      },
      context,
    );
    expect(result.createdByName).toBe('管理员');
  });

  it('rejects duplicate return allocations before entering the repository transaction', async () => {
    const service = new ProductionInventoryService({} as never, {} as never, idempotency as never);
    await expect(
      service.createReturnOrder(
        {
          productionBatchId: '8',
          details: [
            { allocationId: '10', returnQuantity: 1 },
            { allocationId: '10', returnQuantity: 2 },
          ],
        },
        context,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('normalizes production material loss without changing the one-to-one quantity', async () => {
    const repository = {
      createMaterialLoss: vi.fn().mockResolvedValue({
        id: '5',
        confirmedById: null,
        createdById: '1',
      }),
    };
    const identity = {
      listUserReferencesByIds: vi.fn().mockResolvedValue([{ id: '1', displayName: '管理员' }]),
    };
    const service = new ProductionInventoryService(
      repository as never,
      identity as never,
      idempotency as never,
    );

    const result = await service.createMaterialLoss(
      {
        productionBatchId: '8',
        allocationId: '10',
        scrapQuantity: 1.25,
        reasonType: ' 搬运损坏 ',
        remark: ' 外壳破损 ',
      },
      context,
    );

    expect(repository.createMaterialLoss).toHaveBeenCalledWith(
      {
        productionBatchId: '8',
        allocationId: '10',
        scrapQuantity: 1.25,
        reasonType: '搬运损坏',
        remark: '外壳破损',
      },
      context,
    );
    expect(result.createdByName).toBe('管理员');
  });

  it('rejects duplicate batch/status stock-check targets', async () => {
    const service = new ProductionInventoryService({} as never, {} as never, idempotency as never);
    await expect(
      service.createStockCheck(
        {
          details: [
            { itemBatchId: '3', stockStatus: 'available' },
            { itemBatchId: '3', stockStatus: 'available' },
          ],
        },
        context,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
