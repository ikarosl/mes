import { describe, expect, it } from 'vitest';
import { evaluateMaterialOutboundEligibility } from '../production-material-outbound-eligibility.js';

const base = {
  batchStatus: 'material_partially_outbound' as const,
  authorizationStatus: 'stale' as const,
  allActiveDemandsAllocated: false,
  hasActiveAllocation: true,
  hasOrderableAllocation: true,
  hasOrderableSupplementAllocation: false,
};

describe('evaluateMaterialOutboundEligibility', () => {
  it('把需求版本变化且仍有分配缺口投影为重新授权阻断', () => {
    expect(evaluateMaterialOutboundEligibility(base)).toMatchObject({
      eligible: false,
      blockedCode: 'short_batch_authorization_stale',
    });
  });

  it('部分出库后完成全部活动需求分配时允许普通齐套制单', () => {
    expect(
      evaluateMaterialOutboundEligibility({ ...base, allActiveDemandsAllocated: true }),
    ).toEqual({
      eligible: true,
      outboundMode: 'normal',
      blockedCode: null,
      blockedReason: null,
    });
  });

  it('短批授权有效时允许短批制单', () => {
    expect(
      evaluateMaterialOutboundEligibility({ ...base, authorizationStatus: 'valid' }),
    ).toMatchObject({ eligible: true, outboundMode: 'short_batch' });
  });

  it('没有可制单分配时优先说明占用事实', () => {
    expect(
      evaluateMaterialOutboundEligibility({ ...base, hasOrderableAllocation: false }),
    ).toMatchObject({ eligible: false, blockedCode: 'no_orderable_allocation' });
  });

  it('已确认出库耗尽的分配不伪装成待出库占用', () => {
    expect(
      evaluateMaterialOutboundEligibility({
        ...base,
        hasActiveAllocation: false,
        hasOrderableAllocation: false,
      }),
    ).toMatchObject({ eligible: false, blockedCode: 'allocation_incomplete' });
  });

  it('已完成整组领料的未开工批次只允许活动补料分配重新制单', () => {
    expect(
      evaluateMaterialOutboundEligibility({
        ...base,
        batchStatus: 'material_outbound',
        hasOrderableSupplementAllocation: false,
      }),
    ).toMatchObject({ eligible: false, blockedCode: 'allocation_incomplete' });
    expect(
      evaluateMaterialOutboundEligibility({
        ...base,
        batchStatus: 'material_outbound',
        hasOrderableSupplementAllocation: true,
      }),
    ).toMatchObject({ eligible: true, outboundMode: 'normal' });
  });
});
