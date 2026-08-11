import { describe, expect, it } from 'vitest';
import { evaluateProductionExecutionCompletion } from '../production-completion.policy.js';

const evaluate = (overrides: Record<string, unknown> = {}) =>
  evaluateProductionExecutionCompletion({
    productionBatchId: '10',
    batchStatus: 'doing',
    version: 2,
    plannedQuantity: '10.0000',
    requiredSteps: [
      {
        id: '22',
        order: 20,
        name: '包装',
        status: 'completed',
        effectiveNormalQuantity: '10.0000',
      },
    ],
    ...overrides,
  } as Parameters<typeof evaluateProductionExecutionCompletion>[0]);

describe('production execution completion policy', () => {
  it('uses the last required reporting step as the completed quantity source', () => {
    expect(evaluate()).toMatchObject({
      canComplete: true,
      finalRequiredStepId: '22',
      finalEffectiveNormalQuantity: '10.0000',
      blockers: [],
    });
  });

  it('reports incomplete steps and a short final quantity without allowing short completion', () => {
    const result = evaluate({
      requiredSteps: [
        {
          id: '22',
          order: 20,
          name: '包装',
          status: 'doing',
          effectiveNormalQuantity: '9.0000',
        },
      ],
    });
    expect(result.canComplete).toBe(false);
    expect(result.blockers).toEqual([
      'required_step_incomplete',
      'final_step_quantity_insufficient',
    ]);
  });
});
