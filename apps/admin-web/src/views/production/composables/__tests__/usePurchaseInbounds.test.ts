import { beforeEach, describe, expect, it, vi } from 'vitest';
import { productionApi } from '../../../../api/production';
import { usePurchaseInbounds } from '../usePurchaseInbounds';
vi.mock('../../../../api/production', () => ({
  productionApi: {
    createPurchaseInbound: vi.fn(),
    confirmPurchaseInbound: vi.fn(),
    cancelPurchaseInbound: vi.fn(),
    listPurchaseInbounds: vi.fn(),
    getPurchaseInbound: vi.fn(),
  },
}));
vi.mock('../../../../composables/idempotency/useIdempotentIntent', () => ({
  useIdempotentIntent: () => ({
    execute: (_: unknown, send: (key: string) => unknown) => send('intent-key'),
    getStatus: () => 'idle',
    reset: vi.fn(),
  }),
}));
describe('usePurchaseInbounds', () => {
  beforeEach(() => vi.clearAllMocks());
  it('sends the same normalized body through the idempotent create intent', async () => {
    vi.mocked(productionApi.createPurchaseInbound).mockResolvedValue({ inboundId: '1' } as never);
    const subject = usePurchaseInbounds();
    await subject.create({
      provider: ' A ',
      details: [{ itemId: '2', batchCode: ' B ', inboundQuantity: 1 }],
    });
    expect(productionApi.createPurchaseInbound).toHaveBeenCalledWith(
      {
        inboundNo: null,
        provider: 'A',
        remark: null,
        details: [{ itemId: '2', batchCode: 'B', inboundQuantity: 1, remark: null }],
      },
      'intent-key',
    );
  });
  it('does not send an idempotency key when cancelling', async () => {
    vi.mocked(productionApi.cancelPurchaseInbound).mockResolvedValue({ inboundId: '1' } as never);
    const subject = usePurchaseInbounds();
    await subject.cancel({ inboundId: '1', version: 0 } as never, '供应商变更');
    expect(productionApi.cancelPurchaseInbound).toHaveBeenCalledWith('1', {
      version: 0,
      reason: '供应商变更',
    });
  });
});
