import { describe, expect, it } from 'vitest';
import { DEMAND_GENERATION_GROUP_TYPE } from '@company/constants';
import { buildDemandGenerationKeys } from '../production-demand-generation-group.js';

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

  // TODO(test-migration): 高重要性：需求来源分组；正式测试获准后按损耗不自动补料规则恢复。
  it.todo('supports loss supplement and future manual-additional generation groups');
});
