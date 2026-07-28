import { describe, expect, it } from 'vitest';
import { CONCURRENCY_ERROR_CODES } from '@company/constants';
import {
  ConcurrencyError,
  idempotencyConflict,
  requireOptimisticUpdate,
} from '../optimistic-lock.js';

describe('concurrency helpers', () => {
  it('maps a stale versioned update to the stable conflict code', () => {
    expect(() => requireOptimisticUpdate(0)).toThrow(ConcurrencyError);
    try {
      requireOptimisticUpdate(0);
    } catch (error) {
      expect(error).toMatchObject({ code: CONCURRENCY_ERROR_CODES.concurrentModification });
    }
  });

  it('uses a distinct error code for reused mismatched idempotency keys', () => {
    expect(idempotencyConflict()).toMatchObject({
      code: CONCURRENCY_ERROR_CODES.idempotencyConflict,
    });
  });
});
