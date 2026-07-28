import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CONCURRENCY_ERROR_CODES } from '@company/constants';
import { idempotencyConflict, requireOptimisticUpdate } from '../optimistic-lock.js';

describe('concurrency helpers', () => {
  it('maps a stale versioned update to the stable conflict code', () => {
    expect(() => requireOptimisticUpdate(0)).toThrow(ConflictException);
    try {
      requireOptimisticUpdate(0);
    } catch (error) {
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: CONCURRENCY_ERROR_CODES.concurrentModification,
      });
    }
  });

  it('uses a distinct error code for reused mismatched idempotency keys', () => {
    expect(idempotencyConflict().getResponse()).toMatchObject({
      code: CONCURRENCY_ERROR_CODES.idempotencyConflict,
    });
  });
});
