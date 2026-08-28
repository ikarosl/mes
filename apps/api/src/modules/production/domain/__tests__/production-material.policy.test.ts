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
  it('allows outbound only from assigned/outbound material states', () => {
    expect(() => requireMaterialOutboundBatchStatus('material_assigned')).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('material_outbound')).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('material_pending')).toThrow();
    expect(() => requireMaterialOutboundBatchStatus('material_pending', false, true)).not.toThrow();
    expect(() =>
      requireMaterialOutboundBatchStatus('material_partially_outbound', false, true),
    ).not.toThrow();
  });
  it('keeps normal remaining demand executable after a short batch starts', () => {
    expect(() => requireMaterialAllocationBatchStatus('material_outbound', true)).not.toThrow();
    expect(() => requireMaterialAllocationBatchStatus('doing', true)).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('doing', true)).not.toThrow();
    expect(() => requireMaterialAllocationBatchStatus('doing', false)).toThrow();
    expect(() => requireMaterialOutboundBatchStatus('doing', false)).toThrow();
    expect(() => requireMaterialAllocationBatchStatus('doing', false, true)).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('doing', false, false, true)).not.toThrow();
  });
});
