import { describe, expect, it } from 'vitest';
import {
  requireMaterialAllocationBatchStatus,
  requireMaterialOutboundBatchStatus,
} from '../production-material.policy.js';

describe('production material policy', () => {
  it('keeps allocation available while a short batch finishes its remaining demand', () => {
    expect(() => requireMaterialAllocationBatchStatus('material_pending')).not.toThrow();
    expect(() => requireMaterialAllocationBatchStatus('material_assigned')).not.toThrow();
    expect(() => requireMaterialAllocationBatchStatus('material_partially_outbound')).not.toThrow();
    expect(() => requireMaterialAllocationBatchStatus('doing')).toThrow();
  });
  it('allows ordinary outbound from assigned state and only supplement outbound after full material outbound', () => {
    expect(() => requireMaterialOutboundBatchStatus('material_assigned')).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('material_outbound')).toThrow();
    expect(() =>
      requireMaterialOutboundBatchStatus('material_outbound', { supplementOnly: true }),
    ).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('material_pending')).toThrow();
    expect(() =>
      requireMaterialOutboundBatchStatus('material_pending', {
        hasValidShortBatchAuthorization: true,
      }),
    ).not.toThrow();
    expect(() =>
      requireMaterialOutboundBatchStatus('material_partially_outbound', {
        hasValidShortBatchAuthorization: true,
      }),
    ).not.toThrow();
  });
  it('continues ordinary outbound after a partially outbound batch becomes fully allocated', () => {
    expect(() =>
      requireMaterialOutboundBatchStatus('material_partially_outbound', {
        allActiveDemandsAllocated: true,
      }),
    ).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('material_partially_outbound')).toThrowError(
      '物料需求计划已变化，当前短批授权已失效；请重新授权，或先完成全部活动需求分配',
    );
  });
  it('keeps normal remaining demand executable after a short batch starts', () => {
    expect(() => requireMaterialAllocationBatchStatus('material_outbound', true)).not.toThrow();
    expect(() => requireMaterialAllocationBatchStatus('doing', true)).not.toThrow();
    expect(() =>
      requireMaterialOutboundBatchStatus('doing', { supplementOnly: true }),
    ).not.toThrow();
    expect(() => requireMaterialAllocationBatchStatus('doing', false)).toThrow();
    expect(() => requireMaterialOutboundBatchStatus('doing')).toThrow();
    expect(() => requireMaterialAllocationBatchStatus('doing', false, true)).not.toThrow();
    expect(() =>
      requireMaterialOutboundBatchStatus('doing', {
        hasConsumedShortBatchAuthorization: true,
      }),
    ).not.toThrow();
  });
});
