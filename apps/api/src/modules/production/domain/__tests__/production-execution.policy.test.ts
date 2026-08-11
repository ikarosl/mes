import { describe, expect, it } from 'vitest';
import {
  requireAssignableStep,
  requireAssignedStep,
  requireFirstStepStartable,
  requireFollowingStepStartable,
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

  it('only releases the first step after all material is outbound', () => {
    expect(() => requireFirstStepStartable('material_outbound')).not.toThrow();
    expect(() => requireFirstStepStartable('material_assigned')).toThrowError(
      expect.objectContaining({ code: 'STEP_START_NOT_ALLOWED' }),
    );
  });

  it('uses upstream normal output or completion to release following steps', () => {
    expect(() =>
      requireFollowingStepStartable({
        batchStatus: 'doing',
        previousNeedRecord: true,
        previousStatus: 'doing',
        previousEffectiveNormal: 1,
      }),
    ).not.toThrow();
    expect(() =>
      requireFollowingStepStartable({
        batchStatus: 'doing',
        previousNeedRecord: false,
        previousStatus: 'completed',
        previousEffectiveNormal: 0,
      }),
    ).not.toThrow();
    expect(() =>
      requireFollowingStepStartable({
        batchStatus: 'doing',
        previousNeedRecord: true,
        previousStatus: 'doing',
        previousEffectiveNormal: 0,
      }),
    ).toThrowError(expect.objectContaining({ code: 'STEP_START_NOT_ALLOWED' }));
  });
});
