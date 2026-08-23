import { describe, expect, it } from 'vitest';
import { requireReworkCompletionQuantities } from '../production-rework.policy.js';

describe('production rework policy', () => {
  it('requires one full disposition quantity per completion', () => {
    expect(() => requireReworkCompletionQuantities('2.0000', 1, 1)).not.toThrow();
    expect(() => requireReworkCompletionQuantities('2.0000', 1, 0)).toThrow('必须等于返工单数量');
    expect(() => requireReworkCompletionQuantities('2.0000', 1.5, 0.5)).toThrow('必须为整数');
  });
});
