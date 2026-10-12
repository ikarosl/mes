import { describe, expect, it } from 'vitest';
import {
  requireMaterialAllocationBatchStatus,
  requireMaterialOutboundBatchStatus,
} from '../production-material.policy.js';

describe('production material policy', () => {
  it('allows allocation across every material-operation phase, including active execution', () => {
    expect(() => requireMaterialAllocationBatchStatus('material_pending')).not.toThrow();
    expect(() => requireMaterialAllocationBatchStatus('material_assigned')).not.toThrow();
    expect(() => requireMaterialAllocationBatchStatus('material_partially_outbound')).not.toThrow();
    expect(() => requireMaterialAllocationBatchStatus('material_outbound')).not.toThrow();
    expect(() => requireMaterialAllocationBatchStatus('doing')).not.toThrow();
    expect(() => requireMaterialAllocationBatchStatus('closing')).toThrow();
  });
  it('allows outbound of available allocations during material preparation and execution', () => {
    expect(() => requireMaterialOutboundBatchStatus('material_pending')).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('material_assigned')).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('material_outbound')).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('material_partially_outbound')).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('doing')).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('closing')).toThrow();
  });
});
