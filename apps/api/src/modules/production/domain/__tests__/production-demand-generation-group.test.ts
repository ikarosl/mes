import { describe, expect, it } from 'vitest';
import { DEMAND_GENERATION_GROUP_TYPE } from '@company/constants';
import {
  buildDemandGenerationGroupKey,
  buildDemandGenerationKeys,
} from '../production-demand-generation-group.js';

describe('production demand generation groups', () => {
  it('builds one normal group with a distinct line idempotency key', () => {
    expect(
      buildDemandGenerationKeys(
        { type: DEMAND_GENERATION_GROUP_TYPE.normal, productionBatchId: '21' },
        '401',
      ),
    ).toEqual({
      generationGroupKey: 'NORMAL:21',
      idempotencyKey: 'NORMAL:21:401',
    });
  });

  it('groups every scrap supplement line by supplement', () => {
    const source = {
      type: DEMAND_GENERATION_GROUP_TYPE.scrapSupplement,
      supplementId: 52,
    } as const;

    expect(buildDemandGenerationKeys(source, 101).generationGroupKey).toBe('SCRAPSUP:52');
    expect(buildDemandGenerationKeys(source, 102).idempotencyKey).toBe('SCRAPSUP:52:102');
  });

  it('supports loss supplement and future manual-additional generation groups', () => {
    expect(
      buildDemandGenerationGroupKey({
        type: DEMAND_GENERATION_GROUP_TYPE.materialLossSupplement,
        supplementId: 61,
      }),
    ).toBe('LOSSSUP:61');
    expect(
      buildDemandGenerationGroupKey({
        type: DEMAND_GENERATION_GROUP_TYPE.manualAdditional,
        productionBatchId: 21,
        businessActionNo: 'ACT-8',
      }),
    ).toBe('ADDITIONAL:21:ACT-8');
  });
});
