import { describe, expect, it } from 'vitest';
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
  it('does not permit reporting before the material chain reaches outbound', () => {
    expect(() => requireBatchTransition('pending', 'material_pending')).not.toThrow();
    expect(() => requireBatchTransition('pending', 'doing')).toThrow(
      '生产批次不能从 pending 变更为 doing',
    );
    expect(() => requireBatchTransition('material_outbound', 'doing')).not.toThrow();
  });

  it('forbids cancellation after material outbound or production start', () => {
    expect(() => requireBatchTransition('material_assigned', 'cancelled')).not.toThrow();
    expect(() => requireBatchTransition('material_outbound', 'cancelled')).toThrow(
      ProductionDomainError,
    );
    expect(() => requireBatchTransition('doing', 'cancelled')).toThrow(ProductionDomainError);
  });
});
