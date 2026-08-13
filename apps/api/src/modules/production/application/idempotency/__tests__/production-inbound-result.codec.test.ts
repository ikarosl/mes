import { describe, expect, it } from 'vitest';
import {
  confirmPurchaseInboundResultCodec,
  createPurchaseInboundResultCodec,
} from '../production-inbound-result.codec.js';

const value = {
  inboundId: '1',
  inboundNo: 'PI-1',
  sourceType: 'purchased' as const,
  provider: '供应商 A',
  status: 'pending' as const,
  inboundAt: null,
  operatorId: null,
  operatorName: null,
  createdById: '7',
  createdByName: '管理员',
  createdAt: '2026-08-12T10:00:00+08:00',
  version: 0,
  remark: null,
  detailCount: 1,
  totalInboundQuantity: '5.0000',
  quantitySummary: [{ unit: 'kg', quantity: '5.0000' }],
  details: [
    {
      id: '2',
      itemId: '3',
      itemCode: 'MAT-1',
      itemName: '物料一',
      itemBatchId: '4',
      batchCode: 'LOT-1',
      inboundQuantity: '5.0000',
      unit: 'kg',
      stockStatus: 'available' as const,
      inventoryTransactionId: null,
    },
  ],
};

describe('production inbound result codecs', () => {
  it('round-trips the complete canonical result for both versioned scopes', () => {
    expect(
      createPurchaseInboundResultCodec.decode(createPurchaseInboundResultCodec.encode(value)),
    ).toEqual(value);
    expect(
      confirmPurchaseInboundResultCodec.decode(confirmPurchaseInboundResultCodec.encode(value)),
    ).toEqual(value);
  });

  it('rejects damaged stored snapshots', () => {
    expect(() => createPurchaseInboundResultCodec.decode({ inboundId: '1' })).toThrow();
    expect(() => confirmPurchaseInboundResultCodec.decode({ ...value, details: [{}] })).toThrow();
  });
});
