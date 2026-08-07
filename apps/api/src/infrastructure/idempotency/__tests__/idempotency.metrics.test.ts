import { describe, expect, it } from 'vitest';
import { IdempotencyMetrics } from '../idempotency.metrics.js';
import { maskedKeyDigest } from '../idempotency-key-digest.js';

describe('IdempotencyMetrics', () => {
  it('初始快照全部为零', () => {
    expect(new IdempotencyMetrics().snapshot()).toEqual({
      firstRun: 0,
      replay: 0,
      conflict: 0,
      storageRetryable: 0,
      corrupt: 0,
    });
  });

  it('各事件累加对应计数器', () => {
    const metrics = new IdempotencyMetrics();
    metrics.recordFirstRun();
    metrics.recordReplay();
    metrics.recordConflict();
    metrics.recordStorageRetryable();
    metrics.recordCorrupt();
    expect(metrics.snapshot()).toEqual({
      firstRun: 1,
      replay: 1,
      conflict: 1,
      storageRetryable: 1,
      corrupt: 1,
    });
  });

  it('reset 清空计数器', () => {
    const metrics = new IdempotencyMetrics();
    metrics.recordReplay();
    metrics.reset();
    expect(metrics.snapshot()).toEqual({
      firstRun: 0,
      replay: 0,
      conflict: 0,
      storageRetryable: 0,
      corrupt: 0,
    });
  });

  it('snapshot 返回副本，外部修改不影响内部计数', () => {
    const metrics = new IdempotencyMetrics();
    const snapshot = metrics.snapshot();
    snapshot.firstRun = 99;
    expect(metrics.snapshot().firstRun).toBe(0);
  });
});

describe('maskedKeyDigest', () => {
  it('相同键产生相同摘要', () => {
    expect(maskedKeyDigest('k-1')).toBe(maskedKeyDigest('k-1'));
  });

  it('不同键产生不同摘要', () => {
    expect(maskedKeyDigest('k-1')).not.toBe(maskedKeyDigest('k-2'));
  });

  it('摘要不含原始键内容', () => {
    const key = '018f14a8-8f10-7d3a-a825-3d7ce6c9bc41';
    expect(maskedKeyDigest(key)).not.toContain('018f14a8');
  });
});
