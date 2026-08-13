import { describe, expect, it, vi } from 'vitest';
import { ProductionInventoryService } from '../production-inventory.service.js';

const context = {
  actorId: '1',
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  ip: null,
  userAgent: null,
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
    const service = new ProductionInventoryService(repository as never, identity as never);

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
    const service = new ProductionInventoryService({} as never, {} as never);
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

  it('rejects duplicate batch/status stock-check targets', async () => {
    const service = new ProductionInventoryService({} as never, {} as never);
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
