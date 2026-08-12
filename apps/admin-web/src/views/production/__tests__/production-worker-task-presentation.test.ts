import { describe, expect, it } from 'vitest';
import type { ProductionWorkerTaskItem } from '@company/contracts';
import {
  workerTaskHasAbnormal,
  workerTaskProgressPercentage,
  workerTaskRemainingNormal,
  workerTaskRiskClass,
} from '../production-worker-task-presentation';

const task = (overrides: Partial<ProductionWorkerTaskItem> = {}): ProductionWorkerTaskItem => ({
  stepRecordId: 'step-1',
  productionBatchId: 'batch-1',
  batchNo: 'PB-001',
  workOrderId: 'order-1',
  workOrderNo: 'WO-001',
  productId: 'product-1',
  productCode: 'P-001',
  productName: '产品',
  stepOrder: 1,
  stepCode: 'S-001',
  stepName: '装配',
  status: 'doing',
  needRecord: true,
  unit: '件',
  plannedQuantity: '10.0000',
  requiredNormalQuantity: '10.0000',
  releasedNormalQuantity: '10.0000',
  availableNormalQuantity: '6.0000',
  effectiveReportedQuantity: '4.0000',
  effectiveNormalQuantity: '4.0000',
  effectiveAbnormalQuantity: '0.0000',
  startedAt: null,
  version: 1,
  canStart: false,
  startBlockedReason: null,
  ...overrides,
});

describe('production worker task presentation', () => {
  it('derives normal progress and remaining quantity', () => {
    expect(workerTaskProgressPercentage(task())).toBe(40);
    expect(workerTaskRemainingNormal(task())).toBe(6);
  });

  it('gives effective abnormal facts the highest visual priority', () => {
    const item = task({
      status: 'assigned',
      canStart: false,
      startBlockedReason: '等待上道工序放行',
      effectiveAbnormalQuantity: '1.0000',
    });
    expect(workerTaskHasAbnormal(item)).toBe(true);
    expect(workerTaskRiskClass(item)).toBe('risk-error-row');
  });

  it('marks an assigned but blocked task as warning without inventing a status', () => {
    expect(
      workerTaskRiskClass(
        task({ status: 'assigned', canStart: false, startBlockedReason: '等待上道工序放行' }),
      ),
    ).toBe('risk-warning-row');
    expect(workerTaskRiskClass(task({ status: 'assigned', canStart: true }))).toBe('');
  });
});
