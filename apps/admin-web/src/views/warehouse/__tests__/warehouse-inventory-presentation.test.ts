import { describe, expect, it } from 'vitest';
import { inventoryTransactionAssociationText } from '../warehouse-inventory-presentation';

describe('warehouse inventory transaction presentation', () => {
  it('prioritizes a reversal association over a business group', () => {
    expect(
      inventoryTransactionAssociationText({
        reversalOfInventoryTransactionId: '18',
        transactionGroupKey: 'STOCKCHECK:7',
      }),
    ).toBe('冲销流水 #18');
  });

  it('turns known group keys into business document labels', () => {
    expect(
      inventoryTransactionAssociationText({
        reversalOfInventoryTransactionId: null,
        transactionGroupKey: 'STOCKCHECK:7',
      }),
    ).toBe('盘点单 #7');
    expect(
      inventoryTransactionAssociationText({
        reversalOfInventoryTransactionId: null,
        transactionGroupKey: 'RETURN:9',
      }),
    ).toBe('退料单 #9');
  });

  it('keeps unknown group keys auditable and uses a dash when absent', () => {
    expect(
      inventoryTransactionAssociationText({
        reversalOfInventoryTransactionId: null,
        transactionGroupKey: 'TRANSFER:11',
      }),
    ).toBe('业务分组 TRANSFER:11');
    expect(
      inventoryTransactionAssociationText({
        reversalOfInventoryTransactionId: null,
        transactionGroupKey: null,
      }),
    ).toBe('-');
  });
});
