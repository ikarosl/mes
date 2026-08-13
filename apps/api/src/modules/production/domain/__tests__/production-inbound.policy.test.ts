import { describe, expect, it } from 'vitest';
import { assertValidPurchaseInboundDraft } from '../production-inbound.policy.js';

describe('production inbound policy', () => {
  it('accepts distinct positive material batch details', () => {
    expect(() =>
      assertValidPurchaseInboundDraft({
        details: [
          { itemId: '1', batchCode: 'LOT-1', inboundQuantity: 1 },
          { itemId: '1', batchCode: 'LOT-2', inboundQuantity: 2 },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects empty, non-positive, and duplicate material batch details', () => {
    expect(() => assertValidPurchaseInboundDraft({ details: [] })).toThrow();
    expect(() =>
      assertValidPurchaseInboundDraft({
        details: [{ itemId: '1', batchCode: 'LOT-1', inboundQuantity: 0 }],
      }),
    ).toThrow();
    expect(() =>
      assertValidPurchaseInboundDraft({
        details: [
          { itemId: '1', batchCode: 'LOT-1', inboundQuantity: 1 },
          { itemId: '1', batchCode: 'LOT-1', inboundQuantity: 2 },
        ],
      }),
    ).toThrow();
  });
});
