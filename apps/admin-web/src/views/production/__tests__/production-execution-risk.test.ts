import { describe, expect, it } from 'vitest';
import type { ProductionExecutionBatchSummary } from '@company/contracts';
import {
  executionBatchHasAbnormal,
  executionBatchOverdueDays,
  executionBatchProgressPercentage,
  executionBatchRiskClass,
} from '../production-execution-risk';

const batch = (
  overrides: Partial<ProductionExecutionBatchSummary> = {},
): ProductionExecutionBatchSummary => ({
  id: '1',
  workOrderId: '2',
  workOrderNo: 'WO-1',
  productId: '3',
  productCode: 'P-1',
  productName: '产品',
  batchNo: 'PB-1',
  routeId: null,
  routeCode: null,
  routeVersion: null,
  plannedQuantity: '10.0000',
  completedQuantity: '0.0000',
  qualifiedQuantity: '0.0000',
  planStartDate: null,
  planEndDate: '2026-08-10',
  startedAt: null,
  status: 'doing',
  materialPlanVersion: 1,
  shortBatchAuthorizationStatus: 'none',
  shortBatchAuthorizationAction: 'not_required',
  ownerId: null,
  ownerName: null,
  completedAt: null,
  completedBy: null,
  remark: null,
  version: 1,
  createdAt: '2026-08-01T00:00:00.000+08:00',
  updatedAt: '2026-08-01T00:00:00.000+08:00',
  completedStepCount: 1,
  totalStepCount: 4,
  effectiveAbnormalQuantity: '0.0000',
  pendingAbnormalCount: 0,
  ...overrides,
});

describe('production execution risk presentation', () => {
  it('calculates progress and overdue days in Beijing calendar dates', () => {
    const item = batch();
    expect(executionBatchProgressPercentage(item)).toBe(25);
    expect(executionBatchOverdueDays(item, new Date('2026-08-12T00:00:00.000Z'))).toBe(2);
    expect(executionBatchRiskClass(item)).toBe('risk-warning');
  });

  it('gives abnormal facts priority over overdue warning', () => {
    const item = batch({ effectiveAbnormalQuantity: '1.0000', pendingAbnormalCount: 1 });
    expect(executionBatchHasAbnormal(item)).toBe(true);
    expect(executionBatchRiskClass(item)).toBe('risk-error');
  });

  it('does not flag completed batches as overdue', () => {
    expect(executionBatchOverdueDays(batch({ status: 'completed' }))).toBe(0);
  });
});
