import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';
import { useMaterialOutboundOrders } from '../use-material-outbound-orders';

const api = vi.hoisted(() => ({
  listMaterialOutboundBatchOptions: vi.fn(),
  listMaterialOutboundCandidates: vi.fn(),
  createMaterialOutbound: vi.fn(),
  confirmMaterialOutbound: vi.fn(),
  cancelMaterialOutbound: vi.fn(),
}));
vi.mock('../../../../api/production/material-outbounds', () => ({
  productionMaterialOutboundsApi: {
    listMaterialOutboundBatchOptions: api.listMaterialOutboundBatchOptions,
    listMaterialOutboundCandidates: api.listMaterialOutboundCandidates,
    createMaterialOutbound: api.createMaterialOutbound,
    confirmMaterialOutbound: api.confirmMaterialOutbound,
    cancelMaterialOutbound: api.cancelMaterialOutbound,
  },
}));

describe('useMaterialOutboundOrders', () => {
  beforeEach(() => Object.values(api).forEach((mock) => mock.mockReset()));

  it('uses the same normalized payload for intent signing and pending order creation', async () => {
    api.createMaterialOutbound.mockResolvedValue({ outbound: { outboundId: '8' } });
    const state = useMaterialOutboundOrders();
    await state.create('3', {
      details: [{ allocationId: '9', outboundQuantity: 2 }],
      remark: '  纸质领料  ',
    });
    expect(api.createMaterialOutbound).toHaveBeenCalledWith(
      '3',
      { details: [{ allocationId: '9', outboundQuantity: 2 }], remark: '纸质领料' },
      expect.any(String),
    );
  });

  it('sends no idempotency key for cancellation and clears its row pending key', async () => {
    const row = { outboundId: '8', version: 2 } as never;
    api.cancelMaterialOutbound.mockResolvedValue(row);
    const state = useMaterialOutboundOrders();
    await state.cancel(row, '计划调整');
    expect(api.cancelMaterialOutbound).toHaveBeenCalledWith('8', {
      version: 2,
      reason: '计划调整',
    });
    expect(state.pendingKeys.value.size).toBe(0);
  });

  it('confirms one outbound with its row version and an idempotency key', async () => {
    api.confirmMaterialOutbound.mockResolvedValue({ outbound: { outboundId: '8' } });
    const state = useMaterialOutboundOrders();

    await state.confirm({ outboundId: '8', version: 4 } as never);

    expect(api.confirmMaterialOutbound).toHaveBeenCalledWith('8', 4, expect.any(String));
    expect(state.pendingKeys.value.size).toBe(0);
  });

  it('does not send a second confirm while the first outbound confirmation is pending', async () => {
    let resolveConfirm!: (value: unknown) => void;
    api.confirmMaterialOutbound.mockReturnValue(
      new Promise((resolve) => {
        resolveConfirm = resolve;
      }),
    );
    const state = useMaterialOutboundOrders();
    const row = { outboundId: '8', version: 4 } as never;

    const first = state.confirm(row);
    const second = state.confirm(row);
    expect(api.confirmMaterialOutbound).toHaveBeenCalledTimes(1);
    expect(await second).toBe(row);

    resolveConfirm({ outbound: row });
    await first;
    expect(state.pendingKeys.value.size).toBe(0);
  });

  it('retains the create intent after an ambiguous failure so retry reuses its key', async () => {
    const requestError = new RequestError('网络断开', 0);
    api.createMaterialOutbound
      .mockRejectedValueOnce(requestError)
      .mockResolvedValueOnce({ outbound: { outboundId: '8' } });
    const state = useMaterialOutboundOrders();
    const payload = { details: [{ allocationId: '9', outboundQuantity: 2 }] };

    await expect(state.create('3', payload)).rejects.toBe(requestError);
    expect(state.createIntentStatus.value).toBe('pending');
    const firstKey = api.createMaterialOutbound.mock.calls[0]?.[2];

    await state.create('3', payload);
    expect(api.createMaterialOutbound).toHaveBeenCalledTimes(2);
    expect(api.createMaterialOutbound.mock.calls[1]?.[2]).toBe(firstKey);
    expect(state.createIntentStatus.value).toBe('idle');
  });

  it('drops late candidate responses after a newer batch selection', async () => {
    let resolveOld!: (value: unknown[]) => void;
    api.listMaterialOutboundCandidates.mockImplementation((batchId: string) =>
      batchId === 'old'
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve([{ allocationId: 'new' }]),
    );
    const state = useMaterialOutboundOrders();

    const oldRequest = state.loadCandidates('old');
    await state.loadCandidates('new');
    expect(state.candidates.value).toEqual([{ allocationId: 'new' }]);
    resolveOld([{ allocationId: 'old' }]);
    await oldRequest;

    expect(state.candidates.value).toEqual([{ allocationId: 'new' }]);
  });

  // TODO(stock-document-list-race): 验证统一列表较早的筛选或分页响应不能覆盖当前查询及总数；
  // 涉及异步并发与单据身份的高重要性覆盖，旧领料分页读取已由统一查询替代；
  // 恢复条件：用户确认统一列表设计并明确授权正式测试后，按 StockDocumentOrdersPanel 恢复。

  // TODO(material-outbound-action-context): 验证精确读取的迟到响应不能替换当前办理主单或版本依据；
  // 涉及异步并发与库存命令身份的高重要性覆盖，旧详情展示状态已退役，现行动作消费读取返回值；
  // 恢复条件：用户确认设计并明确授权正式测试后，按现行动作读取返回值和上下文边界恢复。
});
