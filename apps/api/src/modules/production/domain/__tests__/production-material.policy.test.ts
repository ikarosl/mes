import { describe, expect, it } from 'vitest';
import {
  requireMaterialAllocationBatchStatus,
  requireMaterialOutboundBatchStatus,
} from '../production-material.policy.js';

describe('production material policy', () => {
  it('allows allocation only before production outbound', () => {
    expect(() => requireMaterialAllocationBatchStatus('material_pending')).not.toThrow();
    expect(() => requireMaterialAllocationBatchStatus('material_assigned')).not.toThrow();
    expect(() => requireMaterialAllocationBatchStatus('doing')).toThrow();
  });
  it('allows outbound only from assigned/outbound material states', () => {
    expect(() => requireMaterialOutboundBatchStatus('material_assigned')).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('material_outbound')).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('material_pending')).toThrow();
  });
  it('allows only supplemental material logistics while production is doing', () => {
    expect(() => requireMaterialAllocationBatchStatus('doing', true)).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('doing', true)).not.toThrow();
    expect(() => requireMaterialAllocationBatchStatus('doing', false)).toThrow();
    expect(() => requireMaterialOutboundBatchStatus('doing', false)).toThrow();
  });
});
