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

  // TODO(production-demand-generation): 验证来源隔离及幂等身份；高重要性，旧补产分组已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按当前初始及人工提需来源恢复。

  // TODO(test-migration): 高重要性：需求来源分组；正式测试获准后按损耗不自动补料规则恢复。
  // TODO(production-test-recovery): supports loss supplement and future manual-additional generation groups；高重要性覆盖，旧结构或夹具已失效且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按当前所有者契约恢复。
});
