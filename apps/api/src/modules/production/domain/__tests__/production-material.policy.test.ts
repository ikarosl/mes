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
    // TODO(production-material-allocation): 验证任务终态禁止分配或释放；高重要性，旧closing状态已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按现行任务终态恢复。
  });
  it('allows outbound of available allocations during material preparation and execution', () => {
    expect(() => requireMaterialOutboundBatchStatus('material_pending')).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('material_assigned')).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('material_outbound')).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('material_partially_outbound')).not.toThrow();
    expect(() => requireMaterialOutboundBatchStatus('doing')).not.toThrow();
    // TODO(production-material-outbound): 验证任务终态禁止领料；高重要性，旧closing状态已退役且正式测试暂未授权；恢复条件：设计验收并获正式测试授权后，按现行任务终态恢复。
  });
});
