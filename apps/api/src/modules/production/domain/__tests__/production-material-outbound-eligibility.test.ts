import { describe, expect, it } from 'vitest';
import { evaluateMaterialOutboundEligibility } from '../production-material-outbound-eligibility.js';

const base = {
  batchStatus: 'material_partially_outbound' as const,
  hasActiveAllocation: true,
  hasOrderableAllocation: true,
};

describe('evaluateMaterialOutboundEligibility', () => {
  it('allows the first partial outbound order as soon as an allocation is available', () => {
    expect(
      evaluateMaterialOutboundEligibility({ ...base, batchStatus: 'material_pending' }),
    ).toEqual({ eligible: true, blockedCode: null, blockedReason: null });
  });

  it('allows a partially outbound batch to order its available allocation', () => {
    expect(evaluateMaterialOutboundEligibility(base)).toEqual({
      eligible: true,
      blockedCode: null,
      blockedReason: null,
    });
  });

  it('allows an ordinary demand to be picked while its batch is executing', () => {
    expect(evaluateMaterialOutboundEligibility({ ...base, batchStatus: 'doing' })).toEqual({
      eligible: true,
      blockedCode: null,
      blockedReason: null,
    });
  });

  it('explains when every active allocation is reserved by another pending order', () => {
    expect(evaluateMaterialOutboundEligibility({ ...base, hasOrderableAllocation: false })).toEqual(
      {
        eligible: false,
        blockedCode: 'no_orderable_allocation',
        blockedReason: '暂无可制单分配，可能已被其他待出库单占用',
      },
    );
  });

  it('explains when no active allocation remains', () => {
    expect(
      evaluateMaterialOutboundEligibility({
        ...base,
        hasActiveAllocation: false,
        hasOrderableAllocation: false,
      }),
    ).toEqual({
      eligible: false,
      blockedCode: 'allocation_incomplete',
      blockedReason: '物料尚未形成可制单分配，请先完成分配',
    });
  });

  it('does not offer an outbound order after the batch enters closeout', () => {
    expect(evaluateMaterialOutboundEligibility({ ...base, batchStatus: 'closing' })).toMatchObject({
      eligible: false,
      blockedCode: 'allocation_incomplete',
    });
  });
});
