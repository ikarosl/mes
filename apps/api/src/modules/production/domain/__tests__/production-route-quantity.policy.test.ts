import { describe, expect, it } from 'vitest';
import {
  calculateRouteStepQuantities,
  type RouteQuantityStep,
  type RouteSupplementSource,
} from '../production-route-quantity.policy.js';

const steps = (aNormal: number, aReported: number, bNormal: number, bReported: number) =>
  [
    {
      id: 'a',
      stepOrder: 1,
      effectiveDirectReported: aReported,
      effectiveNormal: aNormal,
    },
    {
      id: 'b',
      stepOrder: 2,
      effectiveDirectReported: bReported,
      effectiveNormal: bNormal,
    },
  ] satisfies RouteQuantityStep[];

const supplement = (
  sourceStepRecordId: 'a' | 'b',
  sourceStepOrder: 1 | 2,
  status: RouteSupplementSource['status'] = 'material_ready',
): RouteSupplementSource => ({
  scrapRecordId: '81',
  supplementId: '91',
  sourceStepRecordId,
  sourceStepOrder,
  sourceStepCode: sourceStepRecordId.toUpperCase(),
  sourceStepName: `工序 ${sourceStepRecordId.toUpperCase()}`,
  quantity: '1.0000',
  status,
});

describe('production route supplement quantity policy', () => {
  it('adds a fulfilled scrap supplement to the unified input limit for every step', () => {
    const result = calculateRouteStepQuantities('5.0000', steps(4, 5, 0, 0), [supplement('a', 1)]);

    expect(result.get('a')).toMatchObject({
      requiredNormalQuantity: '5',
      upperLimitQuantity: '6',
      availableReportQuantity: '1',
      activatedSupplementInputQuantity: '1',
      activatedSupplementTargetQuantity: '0',
    });
    expect(result.get('b')).toMatchObject({
      requiredNormalQuantity: '5',
      upperLimitQuantity: '6',
    });
  });

  it('shows route differences without enforcing upstream release or reopening steps', () => {
    const beforeAReplacement = calculateRouteStepQuantities('5.0000', steps(5, 5, 4, 5), [
      supplement('b', 2),
    ]);

    expect(beforeAReplacement.get('a')).toMatchObject({
      requiredNormalQuantity: '6',
      upperLimitQuantity: '6',
      availableReportQuantity: '1',
    });
    expect(beforeAReplacement.get('b')).toMatchObject({
      requiredNormalQuantity: '5',
      upperLimitQuantity: '6',
      availableReportQuantity: '1',
      remainingNormalQuantity: '1',
    });

    const afterAReplacement = calculateRouteStepQuantities('5.0000', steps(6, 6, 4, 5), [
      supplement('b', 2),
    ]);
    expect(afterAReplacement.get('b')).toMatchObject({
      upperLimitQuantity: '6',
      availableReportQuantity: '1',
    });
  });

  it('does not release pending supplements before every material demand is outbound', () => {
    const result = calculateRouteStepQuantities('5.0000', steps(5, 5, 4, 5), [
      supplement('b', 2, 'pending_material'),
    ]);

    expect(result.get('a')).toMatchObject({
      requiredNormalQuantity: '5',
      upperLimitQuantity: '5',
      pendingSupplementInputQuantity: '1',
    });
    expect(result.get('b')?.availableReportQuantity).toBe('0');
  });

  it('does not make a rework completion report consume ordinary route input again', () => {
    const result = calculateRouteStepQuantities(
      '5.0000',
      [
        {
          id: 'a',
          stepOrder: 1,
          effectiveDirectReported: '5.0000',
          effectiveNormal: '5.0000',
        },
      ],
      [supplement('a', 1)],
    );

    expect(result.get('a')?.availableReportQuantity).toBe('1');
  });
});
