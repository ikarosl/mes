import { describe, expect, it } from 'vitest';
import { ProductionDomainError } from '../production.errors.js';
import { requireBatchTransition, requireWorkOrderTransition } from '../production-status.policy.js';

describe('production status policy', () => {
  it('only releases or cancels draft work orders', () => {
    expect(() => requireWorkOrderTransition('draft', 'released')).not.toThrow();
    expect(() => requireWorkOrderTransition('draft', 'doing')).toThrow(ProductionDomainError);
  });
  it('does not permit reporting before the material chain reaches outbound', () => {
    expect(() => requireBatchTransition('pending', 'material_pending')).not.toThrow();
    expect(() => requireBatchTransition('pending', 'doing')).toThrow(
      '生产批次不能从 pending 变更为 doing',
    );
    expect(() => requireBatchTransition('material_outbound', 'doing')).not.toThrow();
  });
});
