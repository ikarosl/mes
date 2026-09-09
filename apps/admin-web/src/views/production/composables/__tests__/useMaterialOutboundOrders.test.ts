import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '@company/request';
import { useMaterialOutboundOrders } from '../useMaterialOutboundOrders';

const api = vi.hoisted(() => ({
  listMaterialOutboundOrders: vi.fn(),
  getMaterialOutbound: vi.fn(),
  listMaterialOutboundBatchOptions: vi.fn(),
  listMaterialOutboundCandidates: vi.fn(),
  createMaterialOutbound: vi.fn(),
  confirmMaterialOutbound: vi.fn(),
  cancelMaterialOutbound: vi.fn(),
}));
vi.mock('../../../../api/production', () => ({ productionApi: api }));

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
    expect(state.getCreateIntentStatus()).toBe('pending');
    const firstKey = api.createMaterialOutbound.mock.calls[0]?.[2];

    await state.create('3', payload);
    expect(api.createMaterialOutbound).toHaveBeenCalledTimes(2);
    expect(api.createMaterialOutbound.mock.calls[1]?.[2]).toBe(firstKey);
    expect(state.getCreateIntentStatus()).toBe('idle');
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

  it('drops a stale order-list response after a newer query', async () => {
    let resolveOld!: (value: unknown) => void;
    api.listMaterialOutboundOrders
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOld = resolve)))
      .mockResolvedValueOnce({ items: [{ outboundId: 'new' }], total: 1 });
    const state = useMaterialOutboundOrders();

    const oldRequest = state.load({ page: 1, pageSize: 20, keyword: 'old' });
    await state.load({ page: 1, pageSize: 20, keyword: 'new' });
    resolveOld({ items: [{ outboundId: 'old' }], total: 1 });
    await oldRequest;

    expect(state.rows.value).toEqual([{ outboundId: 'new' }]);
    expect(state.total.value).toBe(1);
  });

  it('does not let a stale detail response replace the currently selected order', async () => {
    let resolveOld!: (value: unknown) => void;
    api.getMaterialOutbound.mockImplementation((id: string) =>
      id === 'old'
        ? new Promise((resolve) => (resolveOld = resolve))
        : Promise.resolve({ outboundId: 'new' }),
    );
    const state = useMaterialOutboundOrders();

    const oldRequest = state.loadDetail('old');
    await state.loadDetail('new');
    resolveOld({ outboundId: 'old' });
    await oldRequest;

    expect(state.detail.value).toEqual({ outboundId: 'new' });
  });
});
