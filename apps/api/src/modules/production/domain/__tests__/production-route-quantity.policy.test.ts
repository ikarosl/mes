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
      needRecord: true,
      status: aNormal >= 5 ? 'completed' : 'doing',
      effectiveDirectReported: aReported,
      effectiveNormal: aNormal,
    },
    {
      id: 'b',
      stepOrder: 2,
      needRecord: true,
      status: 'doing',
      effectiveDirectReported: bReported,
      effectiveNormal: bNormal,
    },
  ] satisfies RouteQuantityStep[];

const supplement = (
  sourceStepRecordId: 'a' | 'b',
  sourceStepOrder: 1 | 2,
  status: RouteSupplementSource['status'] = 'activated',
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
  it('turns the first-step input limit from 5 to 6 after its own scrap supplement activates', () => {
    const result = calculateRouteStepQuantities('5.0000', steps(4, 5, 0, 0), [supplement('a', 1)]);

    expect(result.get('a')).toMatchObject({
      requiredNormalQuantity: '5.0000',
      releasedInputQuantity: '6.0000',
      availableReportQuantity: '1.0000',
      activatedSupplementInputQuantity: '1.0000',
      activatedSupplementTargetQuantity: '0.0000',
    });
    expect(result.get('b')).toMatchObject({
      requiredNormalQuantity: '5.0000',
      releasedInputQuantity: '4.0000',
    });
  });

  it('reopens A for scrap at B and keeps B blocked until A produces the replacement', () => {
    const reopenedSteps = steps(5, 5, 4, 5);
    reopenedSteps[0]!.status = 'doing';
    const beforeAReplacement = calculateRouteStepQuantities('5.0000', reopenedSteps, [
      supplement('b', 2),
    ]);

    expect(beforeAReplacement.get('a')).toMatchObject({
      requiredNormalQuantity: '6.0000',
      releasedInputQuantity: '6.0000',
      availableReportQuantity: '1.0000',
      isSupplementReopened: true,
    });
    expect(beforeAReplacement.get('b')).toMatchObject({
      requiredNormalQuantity: '5.0000',
      releasedInputQuantity: '5.0000',
      availableReportQuantity: '0.0000',
      remainingNormalQuantity: '1.0000',
      supplementBlockedReason: '等待前道补产形成新的正常放行量',
    });

    const afterAReplacement = calculateRouteStepQuantities('5.0000', steps(6, 6, 4, 5), [
      supplement('b', 2),
    ]);
    expect(afterAReplacement.get('b')).toMatchObject({
      releasedInputQuantity: '6.0000',
      availableReportQuantity: '1.0000',
      supplementBlockedReason: null,
    });
  });

  it('does not release pending supplements before every material demand is outbound', () => {
    const result = calculateRouteStepQuantities('5.0000', steps(5, 5, 4, 5), [
      supplement('b', 2, 'pending_material'),
    ]);

    expect(result.get('a')).toMatchObject({
      requiredNormalQuantity: '5.0000',
      releasedInputQuantity: '5.0000',
      pendingSupplementInputQuantity: '1.0000',
    });
    expect(result.get('b')?.availableReportQuantity).toBe('0.0000');
  });

  it('does not make a rework completion report consume ordinary route input again', () => {
    const result = calculateRouteStepQuantities(
      '5.0000',
      [
        {
          id: 'a',
          stepOrder: 1,
          needRecord: true,
          status: 'doing',
          effectiveDirectReported: '5.0000',
          effectiveNormal: '5.0000',
        },
      ],
      [supplement('a', 1)],
    );

    expect(result.get('a')?.availableReportQuantity).toBe('1.0000');
  });
});
