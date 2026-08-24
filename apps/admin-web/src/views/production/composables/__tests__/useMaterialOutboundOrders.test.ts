import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
