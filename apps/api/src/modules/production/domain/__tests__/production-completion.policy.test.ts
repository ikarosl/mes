import { describe, expect, it } from 'vitest';
import { evaluateProductionExecutionCompletion } from '../production-completion.policy.js';

const evaluate = (overrides: Record<string, unknown> = {}) =>
  evaluateProductionExecutionCompletion({
    productionBatchId: '10',
    batchStatus: 'doing',
    version: 2,
    plannedQuantity: '10',
    requiredSteps: [{ status: 'completed' }],
    ...overrides,
  } as Parameters<typeof evaluateProductionExecutionCompletion>[0]);

describe('production execution completion policy', () => {
  it('allows execution end after all required steps are complete', () => {
    expect(evaluate()).toMatchObject({
      canComplete: true,
      requiredStepCount: 1,
      completedRequiredStepCount: 1,
      blockers: [],
    });
  });

  it('reports incomplete required steps', () => {
    const result = evaluate({
      requiredSteps: [
        {
          status: 'doing',
        },
      ],
    });
    expect(result.canComplete).toBe(false);
    expect(result.blockers).toEqual(['required_step_incomplete']);
  });

  it('leaves active demands and unfulfilled supplements for closeout without blocking execution end', () => {
    expect(evaluate({ activeMaterialDemandCount: 2, unfulfilledSupplementCount: 1 })).toMatchObject(
      {
        canComplete: true,
        activeMaterialDemandCount: 2,
        unfulfilledSupplementCount: 1,
        blockers: [],
      },
    );
  });
});
