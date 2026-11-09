import { describe, expect, it } from 'vitest';
import { PRODUCTION_BATCH_STATUSES } from '@company/constants';

import { ProductionDomainError } from '../production.errors.js';
import { requireBatchTransition, requireWorkOrderTransition } from '../production-status.policy.js';

describe('production status policy', () => {
  it('only releases or cancels draft work orders', () => {
    expect(() => requireWorkOrderTransition('draft', 'released')).not.toThrow();
    expect(() => requireWorkOrderTransition('draft', 'cancelled')).not.toThrow();
    expect(() => requireWorkOrderTransition('draft', 'doing')).toThrow(ProductionDomainError);
    expect(() => requireWorkOrderTransition('released', 'cancelled')).toThrow(
      ProductionDomainError,
    );
    expect(() => requireWorkOrderTransition('released', 'completed')).not.toThrow();
  });
  it('permits an explicit task start after initial material configuration', () => {
    expect(() => requireBatchTransition('pending', 'material_pending')).not.toThrow();
    expect(() => requireBatchTransition('pending', 'doing')).toThrow(
      '生产批次不能从 pending 变更为 doing',
    );
    expect(() => requireBatchTransition('material_pending', 'doing')).not.toThrow();
    expect(() => requireBatchTransition('material_assigned', 'doing')).not.toThrow();
    expect(() => requireBatchTransition('material_partially_outbound', 'doing')).not.toThrow();
    expect(() => requireBatchTransition('material_outbound', 'doing')).not.toThrow();
  });

  it('covers every material-state transition used by allocation and outbound', () => {
    expect(() => requireBatchTransition('material_pending', 'material_assigned')).not.toThrow();
    expect(() => requireBatchTransition('material_assigned', 'material_pending')).not.toThrow();
    expect(() =>
      requireBatchTransition('material_pending', 'material_partially_outbound'),
    ).not.toThrow();
    expect(() => requireBatchTransition('material_pending', 'material_outbound')).not.toThrow();
    expect(() => requireBatchTransition('material_assigned', 'material_outbound')).not.toThrow();
    expect(() =>
      requireBatchTransition('material_partially_outbound', 'material_outbound'),
    ).not.toThrow();
  });

  it('never permits an existing production batch to transition back to initial pending', () => {
    for (const status of PRODUCTION_BATCH_STATUSES) {
      if (status === 'pending') continue;
      expect(() => requireBatchTransition(status, 'pending')).toThrow(ProductionDomainError);
    }
  });

  // TODO(production-tracking-status): 验证任务状态完整性及结束阻断；高重要性，旧复杂结案状态已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按追踪卡与简化结束规则恢复。

  it('forbids cancellation after material outbound or production start', () => {
    expect(() => requireBatchTransition('material_assigned', 'cancelled')).not.toThrow();
    expect(() => requireBatchTransition('material_outbound', 'cancelled')).toThrow(
      ProductionDomainError,
    );
    expect(() => requireBatchTransition('doing', 'cancelled')).toThrow(ProductionDomainError);
  });
});
