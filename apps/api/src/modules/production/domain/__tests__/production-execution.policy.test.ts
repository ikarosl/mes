import { describe, expect, it } from 'vitest';
import {
  requireAssignableStep,
  requireAssignedStep,
  productionTaskStartBlockedReason,
  requireTaskExecutingForStepStart,
} from '../production-execution.policy.js';

describe('production execution policy', () => {
  it('keeps assignment transitions explicit', () => {
    expect(() => requireAssignableStep('pending')).not.toThrow();
    expect(() => requireAssignableStep('assigned')).toThrowError(
      expect.objectContaining({ code: 'STEP_ASSIGNMENT_CONFLICT' }),
    );
    expect(() => requireAssignedStep('assigned')).not.toThrow();
    expect(() => requireAssignedStep('doing')).toThrowError(
      expect.objectContaining({ code: 'STEP_ASSIGNMENT_CONFLICT' }),
    );
  });

  it('allows administrator start after material configuration without requiring full allocation or outbound', () => {
    for (const batchStatus of [
      'material_pending',
      'material_assigned',
      'material_partially_outbound',
      'material_outbound',
    ] as const) {
      expect(
        productionTaskStartBlockedReason({
          batchStatus,
          workOrderStatus: 'released',
          orderType: 'mass_production',
          hasInitialMaterialConfiguration: true,
        }),
      ).toBeNull();
    }
    expect(
      productionTaskStartBlockedReason({
        batchStatus: 'material_pending',
        workOrderStatus: 'released',
        orderType: 'mass_production',
        hasInitialMaterialConfiguration: false,
      }),
    ).toBe('请先完整确认本任务的初始 BOM 需求配置');
    expect(
      productionTaskStartBlockedReason({
        batchStatus: 'material_pending',
        workOrderStatus: 'released',
        orderType: 'research',
        hasInitialMaterialConfiguration: false,
      }),
    ).toBe('请先配置至少一条本任务的正式物料需求');
  });

  it('requires an administrator to start the task before a worker starts a step', () => {
    expect(() => requireTaskExecutingForStepStart({ batchStatus: 'doing' })).not.toThrow();
    expect(() =>
      requireTaskExecutingForStepStart({ batchStatus: 'material_partially_outbound' }),
    ).toThrowError(expect.objectContaining({ code: 'STEP_START_NOT_ALLOWED' }));
  });
});
