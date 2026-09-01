import { describe, expect, it } from 'vitest';
import { PRODUCTION_BATCH_STATUSES } from '@company/constants';
import type { ProductionBatchStatus } from '@company/contracts';
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

  it('matches the complete production batch transition specification', () => {
    const expected: Readonly<Record<ProductionBatchStatus, readonly ProductionBatchStatus[]>> = {
      pending: ['material_pending', 'cancelled'],
      material_pending: [
        'material_assigned',
        'material_partially_outbound',
        'material_outbound',
        'cancelled',
      ],
      material_assigned: ['material_pending', 'material_outbound', 'cancelled'],
      material_partially_outbound: ['material_outbound', 'doing'],
      material_outbound: ['doing'],
      doing: ['completed'],
      completed: [],
      cancelled: [],
    };
    for (const current of PRODUCTION_BATCH_STATUSES) {
      for (const next of PRODUCTION_BATCH_STATUSES) {
        if (expected[current].includes(next)) {
          expect(() => requireBatchTransition(current, next)).not.toThrow();
        } else {
          expect(() => requireBatchTransition(current, next)).toThrow(ProductionDomainError);
        }
      }
    }
  });

  it('forbids cancellation after material outbound or production start', () => {
    expect(() => requireBatchTransition('material_assigned', 'cancelled')).not.toThrow();
    expect(() => requireBatchTransition('material_outbound', 'cancelled')).toThrow(
      ProductionDomainError,
    );
    expect(() => requireBatchTransition('doing', 'cancelled')).toThrow(ProductionDomainError);
  });
});
