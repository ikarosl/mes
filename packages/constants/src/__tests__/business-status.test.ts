import { describe, expect, it } from 'vitest';
import {
  ALLOCATION_STATUSES,
  BATCH_STEP_ABNORMAL_DISPOSITION_TYPES,
  BATCH_STEP_ABNORMAL_REVIEW_STATUSES,
  BATCH_STEP_STATUSES,
  BATCH_STEP_REPORT_TYPES,
  DEMAND_TYPES,
  FINISHED_FLOW_TYPES,
  INVENTORY_REFERENCE_TYPE_LABELS,
  INVENTORY_REFERENCE_TYPES,
  INVENTORY_SOURCE_TYPES,
  INVENTORY_TRANSACTION_TYPE_LABELS,
  INVENTORY_TRANSACTION_TYPES,
  OUTBOUND_ORDER_STATUSES,
  PRODUCTION_EXECUTION_COMPLETION_BLOCKERS,
  REWORK_STATUSES,
  SCRAP_SCENES,
  STOCK_STATUSES,
} from '../index';

const persistedCodeSets = [
  INVENTORY_SOURCE_TYPES,
  STOCK_STATUSES,
  INVENTORY_TRANSACTION_TYPES,
  INVENTORY_REFERENCE_TYPES,
  ALLOCATION_STATUSES,
  BATCH_STEP_STATUSES,
  BATCH_STEP_REPORT_TYPES,
  BATCH_STEP_ABNORMAL_REVIEW_STATUSES,
  BATCH_STEP_ABNORMAL_DISPOSITION_TYPES,
  REWORK_STATUSES,
  DEMAND_TYPES,
  OUTBOUND_ORDER_STATUSES,
  PRODUCTION_EXECUTION_COMPLETION_BLOCKERS,
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

  it('provides complete inventory transaction and reference labels', () => {
    expect(Object.keys(INVENTORY_TRANSACTION_TYPE_LABELS)).toEqual(INVENTORY_TRANSACTION_TYPES);
    expect(Object.keys(INVENTORY_REFERENCE_TYPE_LABELS)).toEqual(INVENTORY_REFERENCE_TYPES);
    expect(INVENTORY_TRANSACTION_TYPE_LABELS.production_material_outbound).toBe('生产领料出库');
    expect(INVENTORY_REFERENCE_TYPE_LABELS.outbound_detail).toBe('出库明细');
  });

  it('separates step execution, abnormal review and current demand type codes', () => {
    expect(BATCH_STEP_STATUSES).toEqual(['pending', 'assigned', 'doing', 'completed']);
    expect(BATCH_STEP_ABNORMAL_REVIEW_STATUSES).toEqual([
      'pending_review',
      'approved',
      'rejected',
      'cancelled',
    ]);
    expect(BATCH_STEP_ABNORMAL_DISPOSITION_TYPES).toEqual(['rework', 'scrap']);
    expect(BATCH_STEP_REPORT_TYPES).toEqual(['normal', 'reversal']);
    expect(REWORK_STATUSES).toEqual(['pending', 'doing', 'completed', 'cancelled']);
    expect(DEMAND_TYPES).toEqual([
      'normal',
      'manual_additional',
      'scrap_supplement',
      'material_loss_supplement',
    ]);
  });

  it('keeps production execution completion blockers stable', () => {
    expect(PRODUCTION_EXECUTION_COMPLETION_BLOCKERS).toEqual([
      'batch_not_doing',
      'no_required_reporting_step',
      'required_step_incomplete',
      'final_step_quantity_insufficient',
    ]);
  });
});
