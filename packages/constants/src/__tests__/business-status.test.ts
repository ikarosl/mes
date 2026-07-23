import { describe, expect, it } from 'vitest';
import {
  ALLOCATION_STATUSES,
  FINISHED_FLOW_TYPES,
  INVENTORY_REFERENCE_TYPES,
  INVENTORY_SOURCE_TYPES,
  INVENTORY_TRANSACTION_TYPES,
  OUTBOUND_ORDER_STATUSES,
  SCRAP_SCENES,
  STOCK_STATUSES,
} from '../index';

const persistedCodeSets = [
  INVENTORY_SOURCE_TYPES,
  STOCK_STATUSES,
  INVENTORY_TRANSACTION_TYPES,
  INVENTORY_REFERENCE_TYPES,
  ALLOCATION_STATUSES,
  OUTBOUND_ORDER_STATUSES,
  SCRAP_SCENES,
  FINISHED_FLOW_TYPES,
] as const;

describe('business persisted codes', () => {
  it('uses unique lowercase snake_case values only', () => {
    for (const values of persistedCodeSets) {
      expect(new Set(values).size).toBe(values.length);
      expect(values.every((value) => /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(value))).toBe(true);
    }
  });

  it('keeps inventory status and scrap scenes stable', () => {
    expect(STOCK_STATUSES).toEqual(['available', 'pending_inspection', 'frozen', 'defective']);
    expect(SCRAP_SCENES).toEqual([
      'warehouse_allocated',
      'return_after_outbound',
      'production_consumed',
      'in_stock',
    ]);
  });
});
