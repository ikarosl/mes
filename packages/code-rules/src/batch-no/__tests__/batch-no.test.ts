import { describe, expect, it } from 'vitest';
import { generateBatchNo, isBatchNoValid } from '../index.js';

describe('batch number rules', () => {
  const rule = { prefix: 'task_batch', padding: 3 };

  it('generates a padded batch code from pure input', () => {
    expect(generateBatchNo({ ...rule, sequence: 1 })).toBe('task_batch-001');
    expect(generateBatchNo({ ...rule, sequence: 12 })).toBe('task_batch-012');
  });

  it('accepts only a manual batch code that follows the configured rule', () => {
    expect(isBatchNoValid('task_batch-001', rule)).toBe(true);
    expect(isBatchNoValid('task_batch-01', rule)).toBe(false);
    expect(isBatchNoValid('other_batch-001', rule)).toBe(false);
  });
});
