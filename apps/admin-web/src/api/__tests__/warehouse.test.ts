import { beforeEach, describe, expect, it, vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../http', () => ({ httpClient: { request } }));

describe('warehouseApi', () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ data: undefined });
  });

  it('uses the return-order endpoints and versioned actions', async () => {
    const { warehouseApi } = await import('../warehouse');
    await warehouseApi.listReturnOrders({ page: 1, pageSize: 20, status: 'pending' });
    await warehouseApi.listReturnCandidates('8');
    await warehouseApi.createReturnOrder({
      productionBatchId: '8',
      details: [{ allocationId: '12', returnQuantity: 3 }],
    });
    await warehouseApi.confirmReturnOrder('20', 2);

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/warehouse/return-orders',
      params: { page: 1, pageSize: 20, status: 'pending' },
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      url: '/warehouse/return-orders/batches/8/candidates',
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      url: '/warehouse/return-orders',
      method: 'POST',
      data: {
        productionBatchId: '8',
        details: [{ allocationId: '12', returnQuantity: 3 }],
      },
    });
    expect(request).toHaveBeenNthCalledWith(4, {
      url: '/warehouse/return-orders/20/actions/confirm',
      method: 'POST',
      data: { version: 2 },
    });
  });

  it('uses candidate, count, complete and cancel stock-check endpoints', async () => {
    const { warehouseApi } = await import('../warehouse');
    await warehouseApi.listStockCheckCandidates({
      page: 1,
      pageSize: 10,
      stockStatus: 'available',
    });
    await warehouseApi.saveStockCheckCounts('5', {
      version: 1,
      details: [{ detailId: '9', actualQuantity: 10 }],
    });
    await warehouseApi.completeStockCheck('5', 2);
    await warehouseApi.cancelStockCheck('6', { version: 0, reason: '盘点范围错误' });

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/warehouse/stock-checks/candidates',
      params: { page: 1, pageSize: 10, stockStatus: 'available' },
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      url: '/warehouse/stock-checks/5',
      method: 'PATCH',
      data: { version: 1, details: [{ detailId: '9', actualQuantity: 10 }] },
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      url: '/warehouse/stock-checks/5/actions/complete',
      method: 'POST',
      data: { version: 2 },
    });
    expect(request).toHaveBeenNthCalledWith(4, {
      url: '/warehouse/stock-checks/6/actions/cancel',
      method: 'POST',
      data: { version: 0, reason: '盘点范围错误' },
    });
  });

  it('uses production material-loss list, candidate and versioned action endpoints', async () => {
    const { warehouseApi } = await import('../warehouse');
    await warehouseApi.listMaterialLosses({ page: 1, pageSize: 20, status: 'pending' });
    await warehouseApi.listMaterialLossCandidates('8');
    await warehouseApi.createMaterialLoss(
      {
        productionBatchId: '8',
        allocationId: '12',
        scrapQuantity: 1,
        reasonType: '搬运损坏',
      },
      'create-loss-key',
    );
    await warehouseApi.confirmMaterialLoss('20', 2, 'confirm-loss-key');

    expect(request).toHaveBeenNthCalledWith(1, {
      url: '/warehouse/scraps',
      params: { page: 1, pageSize: 20, status: 'pending' },
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      url: '/warehouse/scraps/batches/8/candidates',
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      url: '/warehouse/scraps',
      method: 'POST',
      data: {
        productionBatchId: '8',
        allocationId: '12',
        scrapQuantity: 1,
        reasonType: '搬运损坏',
      },
      headers: { 'Idempotency-Key': 'create-loss-key' },
      retryUnsafe: true,
      retryTimes: 2,
    });
    expect(request).toHaveBeenNthCalledWith(4, {
      url: '/warehouse/scraps/20/actions/confirm',
      method: 'POST',
      data: { version: 2 },
      headers: { 'Idempotency-Key': 'confirm-loss-key' },
      retryUnsafe: true,
      retryTimes: 2,
    });
  });
});
