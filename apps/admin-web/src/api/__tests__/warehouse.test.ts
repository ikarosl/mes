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

  // TODO(stock-check-request-contract): 验证盘点候选、实盘数量保存及完成／取消请求保留数量和版本；
  // 涉及库存调整与乐观锁的高重要性覆盖，盘点页面停用后专属请求封装废弃；
  // 恢复条件：盘点入口重新获准实现且正式测试获授权后，按现行接口恢复。

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
    });
    expect(request).toHaveBeenNthCalledWith(4, {
      url: '/warehouse/scraps/20/actions/confirm',
      method: 'POST',
      data: { version: 2 },
      headers: { 'Idempotency-Key': 'confirm-loss-key' },
    });
  });
});
