import { describe, expect, it } from 'vitest';
import {
  inventorySourceTypeLabels,
  inventoryTransactionTypeLabels,
  stockStatusLabels,
} from '../business-status';

describe('business status labels', () => {
  it('maps persisted English codes to Chinese labels', () => {
    expect(inventorySourceTypeLabels.purchased).toBe('外购物料入库');
    expect(stockStatusLabels.pending_inspection).toBe('待检');
    expect(inventoryTransactionTypeLabels.production_material_outbound).toBe('生产领料出库');
  });
});
